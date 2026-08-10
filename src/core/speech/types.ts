import type { TranscriptChunk } from "../types";

/**
 * Streaming speech-to-text. Implementations own their transport (e.g. Sarvam
 * WebSocket) and emit partial + final transcript chunks as they arrive.
 */
export interface STTProvider {
  readonly name: string;
  start(onChunk: (chunk: TranscriptChunk) => void): Promise<void>;
  /** Feed raw audio from the client (PCM/opus per implementation contract). */
  pushAudio(audio: Buffer): void;
  stop(): Promise<void>;
}

/**
 * Text-to-speech. Called sentence-by-sentence by the orchestrator so playback
 * starts before the full LLM response exists.
 */
export interface TTSProvider {
  readonly name: string;
  /** Synthesize one sentence; resolves to encoded audio ready for the client. */
  synthesize(text: string): Promise<{ audio: Buffer; mimeType: string }>;
}
