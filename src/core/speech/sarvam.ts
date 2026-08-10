import type { TranscriptChunk } from "../types";
import type { STTProvider, TTSProvider } from "./types";

/**
 * Sarvam streaming STT over WebSocket. STUB — wire up in the speech phase:
 * model ids, endpoint URLs, and audio format must be verified against
 * https://docs.sarvam.ai before implementation.
 */
export class SarvamSTT implements STTProvider {
  readonly name = "sarvam-stt";

  async start(_onChunk: (chunk: TranscriptChunk) => void): Promise<void> {
    throw new Error("SarvamSTT not implemented yet");
  }

  pushAudio(_audio: Buffer): void {
    throw new Error("SarvamSTT not implemented yet");
  }

  async stop(): Promise<void> {}
}

/** Sarvam TTS. STUB — same verification rule as above. */
export class SarvamTTS implements TTSProvider {
  readonly name = "sarvam-tts";

  async synthesize(_text: string): Promise<{ audio: Buffer; mimeType: string }> {
    throw new Error("SarvamTTS not implemented yet");
  }
}
