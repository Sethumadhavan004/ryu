import type { StoredAudio } from "./vault.types";

export interface CaptureOptions {
  /** Live-draft chunk (16 kHz mono WAV) and its start offset in seconds. */
  onChunk: (wav: Uint8Array, startSec: number) => void;
  chunkSec: number;
}

export interface CaptureResult {
  audio: StoredAudio;
  /** Bytes to upload for the final pass. */
  body: Blob | Uint8Array;
  type: string;
  durationSec: number;
}

export interface Capture {
  start(opts: CaptureOptions): Promise<void>;
  /** Web: also capture a browser tab's audio (online meetings). */
  addTabAudio(): Promise<boolean>;
  readonly canTabAudio: boolean;
  stop(): Promise<CaptureResult>;
  /** Abort without producing a result (e.g. app closing). */
  cancel(): void;
}
