import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SarvamAIClient } from "sarvamai";

type SpeechToTextStreamingSocket = Awaited<
  ReturnType<SarvamAIClient["speechToTextStreaming"]["connect"]>
>;
import type { TranscriptChunk } from "../types";
import type { STTProvider, TTSProvider } from "./types";

// Contracts verified against the official `sarvamai` SDK v1.1.8 source
// (node_modules/sarvamai/dist/cjs/api). Streaming STT does NOT support
// diarization — that's batch-API only, which is why meeting-mode speaker
// attribution runs as a post-meeting job.

export const STT_SAMPLE_RATE = 16000;

/**
 * Sarvam streaming STT (saaras:v4 over WebSocket). Receives raw PCM16 mono
 * 16kHz from the client, wraps each chunk in a WAV header (the SDK's
 * documented encoding is "audio/wav"), and emits finalized transcript
 * segments — the streaming API sends complete utterance segments, not
 * token-level partials.
 */
export class SarvamSTT implements STTProvider {
  readonly name = "sarvam-stt";
  private client: SarvamAIClient;
  private socket: SpeechToTextStreamingSocket | null = null;

  constructor(apiKey: string) {
    this.client = new SarvamAIClient({ apiSubscriptionKey: apiKey });
  }

  async start(onChunk: (chunk: TranscriptChunk) => void): Promise<void> {
    const socket = await this.client.speechToTextStreaming.connect({
      "language-code": "unknown", // auto-detect; handles code-mixed speech
      model: "saaras:v4",
      sample_rate: String(STT_SAMPLE_RATE),
      // Deliberately NOT high_vad_sensitivity: it splits natural pauses into
      // fragment finals. Segment aggregation lives in the orchestrator.
    });
    socket.on("message", (message) => {
      const data = message.data as { transcript?: unknown };
      if (message.type === "data" && typeof data.transcript === "string" && data.transcript.trim()) {
        onChunk({ text: data.transcript, isFinal: true });
      }
    });
    socket.on("error", (error) => {
      console.error("[sarvam-stt]", error.message);
    });
    await socket.waitForOpen();
    this.socket = socket;
  }

  pushAudio(audio: Buffer): void {
    this.socket?.transcribe({
      audio: pcmToWav(audio, STT_SAMPLE_RATE).toString("base64"),
      encoding: "audio/wav",
      sample_rate: STT_SAMPLE_RATE,
    });
  }

  /** Force-finalize whatever is buffered (e.g. push-to-talk released). */
  flush(): void {
    this.socket?.flush();
  }

  async stop(): Promise<void> {
    this.socket?.close();
    this.socket = null;
  }
}

/**
 * Sarvam TTS via REST (bulbul:v3). Returns base64-decoded WAV per sentence.
 *
 * TTS dominates cost (~87% of session spend, ~₹3/1k chars observed), so
 * every synthesis is cached on disk keyed by (model, speaker, text) —
 * recurring sentences ("What would you like to know?") are paid for once.
 */
export class SarvamTTS implements TTSProvider {
  readonly name = "sarvam-tts";
  private client: SarvamAIClient;
  private cacheDir = join(process.cwd(), ".tts-cache");

  constructor(
    apiKey: string,
    private speaker: string = process.env.RYU_TTS_SPEAKER ?? "shubh",
  ) {
    this.client = new SarvamAIClient({ apiSubscriptionKey: apiKey });
    mkdirSync(this.cacheDir, { recursive: true });
  }

  async synthesize(text: string): Promise<{ audio: Buffer; mimeType: string }> {
    const normalized = text.trim().replace(/\s+/g, " ");
    const key = createHash("sha256")
      .update(`bulbul:v3|${this.speaker}|${normalized.toLowerCase()}`)
      .digest("hex");
    const cachePath = join(this.cacheDir, `${key}.wav`);
    if (existsSync(cachePath)) {
      return { audio: readFileSync(cachePath), mimeType: "audio/wav" };
    }
    const result = await this.convert(normalized);
    writeFileSync(cachePath, result.audio);
    return result;
  }

  private async convert(text: string): Promise<{ audio: Buffer; mimeType: string }> {
    const response = await this.client.textToSpeech.convert({
      // bulbul:v3 caps input at 2500 chars; sentences are far below that.
      text: text.slice(0, 2500),
      language_code: "en-IN",
      model: "bulbul:v3",
      speaker: this.speaker as never,
      speech_sample_rate: 24000,
    });
    const wavBase64 = response.audios[0];
    if (!wavBase64) throw new Error("Sarvam TTS returned no audio");
    return { audio: Buffer.from(wavBase64, "base64"), mimeType: "audio/wav" };
  }
}

/** Prepend a 44-byte WAV header to raw PCM16 mono audio. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2; // mono, 16-bit
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
