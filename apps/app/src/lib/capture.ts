import { levels } from "../state/levels";
import type { Capture, CaptureOptions, CaptureResult } from "./capture.types";
import { Chunker, to16k } from "./wav";

/**
 * Web capture (Research 02 §4, Research 03 §3).
 * One mixed stream → two consumers:
 *   1. MediaRecorder (Opus, 32 kbps ≈ 14 MB/h) → the final diarized pass
 *   2. PCM tap → 16 kHz WAV chunks → live draft transcript
 * MediaRecorder timeslices after the first are not standalone files, which is
 * why the live draft gets its own PCM path instead of reusing recorder chunks.
 */
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("ryu-tap", Tap);
`;

function pickMime(): string {
  const prefs = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"];
  return prefs.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export function createCapture(): Capture {
  let ctx: AudioContext | null = null;
  let mic: MediaStream | null = null;
  let tab: MediaStream | null = null;
  let mixer: GainNode | null = null;
  let recorder: MediaRecorder | null = null;
  let node: AudioWorkletNode | ScriptProcessorNode | null = null;
  let chunker: Chunker | null = null;
  const blobs: Blob[] = [];
  let t0 = 0;

  const cleanup = () => {
    node?.disconnect();
    mic?.getTracks().forEach((t) => t.stop());
    tab?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    levels.readers.input = null;
    levels.input = 0;
    ctx = mic = tab = mixer = recorder = node = chunker = null;
  };

  return {
    canTabAudio: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia,

    async start(opts: CaptureOptions) {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      ctx = new AudioContext();
      mixer = ctx.createGain();
      ctx.createMediaStreamSource(mic).connect(mixer);

      // Level meter.
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      mixer.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      levels.readers.input = () => {
        analyser.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        return Math.min(1, Math.sqrt(s / buf.length) * 5);
      };

      // 1) Full recording.
      const dest = ctx.createMediaStreamDestination();
      mixer.connect(dest);
      const mime = pickMime();
      recorder = new MediaRecorder(dest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      recorder.ondataavailable = (e) => e.data.size && blobs.push(e.data);
      recorder.start(1000);
      t0 = performance.now();

      // 2) PCM tap for live chunks.
      const rate = ctx.sampleRate;
      chunker = new Chunker(16000, opts.chunkSec, opts.onChunk);
      const onFrame = (f: Float32Array) => chunker?.push(to16k(f, rate), (performance.now() - t0) / 1000);
      try {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
        await ctx.audioWorklet.addModule(url);
        const w = new AudioWorkletNode(ctx, "ryu-tap");
        w.port.onmessage = (e) => onFrame(e.data as Float32Array);
        mixer.connect(w);
        node = w;
      } catch {
        const sp = ctx.createScriptProcessor(4096, 1, 1);
        sp.onaudioprocess = (e) => onFrame(new Float32Array(e.inputBuffer.getChannelData(0)));
        mixer.connect(sp);
        sp.connect(ctx.destination); // required for ScriptProcessor to run; outputs silence
        node = sp;
      }
    },

    async addTabAudio() {
      if (!ctx || !mixer) return false;
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        s.getVideoTracks().forEach((t) => t.stop());
        if (!s.getAudioTracks().length) return false;
        tab = s;
        ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(mixer);
        return true;
      } catch {
        return false;
      }
    },

    async stop(): Promise<CaptureResult> {
      const durationSec = (performance.now() - t0) / 1000;
      chunker?.flush();
      const rec = recorder;
      if (rec && rec.state !== "inactive") {
        await new Promise<void>((resolve) => {
          rec.onstop = () => resolve();
          rec.stop();
        });
      }
      const type = (rec?.mimeType || "audio/webm").split(";")[0];
      cleanup();
      const blob = new Blob(blobs.splice(0), { type });
      return { audio: { type, blob }, body: blob, type, durationSec };
    },

    cancel() {
      try {
        recorder?.stop();
      } catch {}
      cleanup();
    },
  };
}
