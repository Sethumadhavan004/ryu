import type { SessionState, ServerEvent, TranscriptChunk } from "../types";
import type { STTProvider, TTSProvider } from "../speech/types";
import type { AgentCore } from "../agent/agent-core";
import type { ModeManager } from "../modes/manager";
import { SentenceSplitter } from "./sentence-splitter";

/**
 * Per-session state machine: idle -> listening -> thinking -> speaking.
 * Owns turn-taking and barge-in. Deterministic; no LLM decisions here.
 */
export class SessionOrchestrator {
  private state: SessionState = "idle";
  /** Bumped on barge-in; in-flight speak pipelines check it and abort. */
  private generation = 0;
  /** Serializes agent turns: a second final transcript waits its turn. */
  private turnQueue: Promise<void> = Promise.resolve();
  /**
   * STT finalizes on every micro-pause, which shreds natural halting speech
   * (especially non-native speakers) into fragments. We aggregate finalized
   * segments for the whole push-to-talk hold and fire ONE agent turn only
   * after release, once no new segment has arrived for SETTLE_MS.
   */
  private pendingSegments: string[] = [];
  private flushRequested = false;
  private settleTimer: NodeJS.Timeout | null = null;
  private static readonly SETTLE_MS = 800;

  constructor(
    private stt: STTProvider,
    private tts: TTSProvider,
    private agent: AgentCore,
    private modes: ModeManager,
    private emit: (event: ServerEvent) => void,
  ) {}

  async start(): Promise<void> {
    await this.stt.start((chunk) => void this.onTranscript(chunk));
    this.setState("listening");
  }

  pushAudio(audio: Buffer): void {
    this.stt.pushAudio(audio);
  }

  /** Push-to-talk released: force-finalize buffered audio, then respond. */
  flush(): void {
    this.flushRequested = true;
    this.stt.flush();
    // Trailing finals can still arrive after the flush signal; wait for the
    // stream to settle before committing the turn.
    this.armSettleTimer();
  }

  /** User started talking over the agent: kill playback + generation. */
  bargeIn(): void {
    this.generation += 1;
    this.clearSettleTimer();
    this.pendingSegments = [];
    this.flushRequested = false;
    this.modes.cancelPendingActivation();
    this.setState("listening");
  }

  async stop(): Promise<void> {
    this.clearSettleTimer();
    await this.stt.stop();
    this.setState("idle");
  }

  private async onTranscript(chunk: TranscriptChunk): Promise<void> {
    this.emit({ type: "transcript", chunk });
    if (!chunk.isFinal || chunk.text.trim() === "") return;

    const utterance = { text: chunk.text, speakerId: chunk.speakerId, timestamp: Date.now() };
    // Modes (e.g. meeting logging) still see every raw segment.
    await this.modes.handleUtterance(utterance);

    this.pendingSegments.push(chunk.text.trim());
    // Still holding the button: keep accumulating. Released: reset the
    // settle window so a trailing segment extends the wait.
    if (this.flushRequested) this.armSettleTimer();
  }

  private commitTurn(): void {
    this.flushRequested = false;
    const text = this.pendingSegments.join(" ").trim();
    this.pendingSegments = [];
    if (!text) return;
    this.turnQueue = this.turnQueue.then(() => this.runTurn(text)).catch(() => {});
  }

  private armSettleTimer(): void {
    this.clearSettleTimer();
    this.settleTimer = setTimeout(() => this.commitTurn(), SessionOrchestrator.SETTLE_MS);
  }

  private clearSettleTimer(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }

  private async runTurn(text: string): Promise<void> {
    const generation = this.generation;
    this.setState("thinking");
    const splitter = new SentenceSplitter(async (sentence) => {
      if (this.generation !== generation) return;
      this.setState("speaking");
      const { audio, mimeType } = await this.tts.synthesize(sentence);
      if (this.generation !== generation) return;
      this.emit({ type: "agent-audio", audioBase64: audio.toString("base64"), mimeType });
    });

    try {
      await this.agent.respond(text, (token) => {
        if (this.generation !== generation) return;
        this.emit({ type: "agent-text", text: token });
        splitter.push(token);
      });
      splitter.flush();
    } catch (error) {
      this.emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (this.generation === generation) this.setState("listening");
    }
  }

  private setState(state: SessionState): void {
    this.state = state;
    this.emit({ type: "state", state });
  }
}
