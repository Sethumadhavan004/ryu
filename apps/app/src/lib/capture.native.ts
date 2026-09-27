import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { File } from "expo-file-system";
import { levels } from "../state/levels";
import type { Capture, CaptureOptions, CaptureResult } from "./capture.types";
import { Chunker } from "./wav";

/**
 * Native capture: expo-audio recorder (AAC m4a) for the final pass, plus an
 * AudioStream (16 kHz PCM) for the live draft when the platform allows both
 * on the mic at once. If the stream can't start, the meeting still records;
 * only the live draft is skipped.
 */
export function createCapture(): Capture {
  let recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
  let stream: InstanceType<typeof AudioModule.AudioStream> | null = null;
  let meter: ReturnType<typeof setInterval> | null = null;
  let chunker: Chunker | null = null;
  let t0 = 0;

  const cleanup = () => {
    if (meter) clearInterval(meter);
    try {
      stream?.stop();
    } catch {}
    levels.input = 0;
    meter = null;
    stream = null;
    chunker = null;
  };

  return {
    canTabAudio: false,

    async start(opts: CaptureOptions) {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) throw new Error("Microphone permission denied.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: true });

      recorder = new AudioModule.AudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      t0 = Date.now();

      meter = setInterval(() => {
        const db = recorder?.getStatus().metering ?? -60;
        levels.input = Math.max(0, Math.min(1, (db + 55) / 45));
      }, 60);

      try {
        chunker = new Chunker(16000, opts.chunkSec, opts.onChunk);
        stream = new AudioModule.AudioStream({ sampleRate: 16000, channels: 1, encoding: "int16" });
        stream.addListener("audioStreamBuffer", (b) => chunker?.push(new Int16Array(b.data), (Date.now() - t0) / 1000));
        await stream.start();
      } catch (e) {
        console.warn("[capture] live PCM stream unavailable; live draft disabled", e);
        stream = null;
      }
    },

    async addTabAudio() {
      return false;
    },

    async stop(): Promise<CaptureResult> {
      const durationSec = (Date.now() - t0) / 1000;
      chunker?.flush();
      cleanup();
      await recorder?.stop();
      const uri = recorder?.uri;
      recorder = null;
      if (!uri) throw new Error("Recording produced no file.");
      const type = "audio/mp4";
      const bytes = await new File(uri).bytes();
      return { audio: { type, uri }, body: bytes, type, durationSec };
    },

    cancel() {
      cleanup();
      void recorder?.stop();
      recorder = null;
    },
  };
}
