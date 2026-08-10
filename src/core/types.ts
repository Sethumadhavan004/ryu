// Shared types across the RYU core.

export type SessionState = "idle" | "listening" | "thinking" | "speaking";

export interface Utterance {
  /** Final transcript of one user turn. */
  text: string;
  /** Sarvam diarization speaker label, when available (meeting mode). */
  speakerId?: string;
  timestamp: number;
}

export interface TranscriptChunk {
  text: string;
  isFinal: boolean;
  speakerId?: string;
}

/** Events flowing server -> client over the session WebSocket. */
export type ServerEvent =
  | { type: "state"; state: SessionState }
  | { type: "transcript"; chunk: TranscriptChunk }
  | { type: "agent-text"; text: string }
  | { type: "agent-audio"; audioBase64: string; mimeType: string }
  | { type: "mode-countdown"; mode: string; secondsLeft: number }
  | { type: "mode-changed"; mode: string | null }
  | { type: "error"; message: string };

/** Events flowing client -> server over the session WebSocket. */
export type ClientEvent =
  | { type: "audio-chunk"; audioBase64: string }
  | { type: "flush" }
  | { type: "barge-in" }
  | { type: "cancel-mode-activation" }
  | { type: "end-session" };
