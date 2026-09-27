import type { Meeting } from "@ryu/core";

/** Stored meeting audio. Web keeps a Blob; native keeps a file URI. */
export interface StoredAudio {
  type: string;
  blob?: Blob;
  uri?: string;
}

/**
 * The device-side vault (Research 03 §2): the device owns every note.
 * Audio is kept so a failed pipeline run can be retried offline-first.
 */
export interface Vault {
  init(): Promise<{ persistent: boolean }>;
  list(): Promise<Meeting[]>;
  save(m: Meeting): Promise<void>;
  remove(id: string): Promise<void>;
  saveAudio(id: string, audio: StoredAudio): Promise<void>;
  getAudio(id: string): Promise<StoredAudio | null>;
}
