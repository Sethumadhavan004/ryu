/** 16-bit mono PCM WAV. The live draft sends ~30 s of these (~1 MB). */
export function encodeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const bytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, bytes, true);
  new Int16Array(buf, 44).set(samples);
  return new Uint8Array(buf);
}

/**
 * Accumulates 16 kHz PCM and cuts chunks at a quiet moment after `targetSec`
 * (up to +6 s), so words aren't split across chunks.
 */
export class Chunker {
  private parts: Int16Array[] = [];
  private len = 0;
  private startedAt = 0; // seconds into the meeting
  constructor(
    private rate: number,
    private targetSec: number,
    private onChunk: (wav: Uint8Array, startSec: number) => void,
  ) {}

  push(pcm: Int16Array, now: number) {
    if (this.len === 0) this.startedAt = now;
    this.parts.push(pcm);
    this.len += pcm.length;
    const sec = this.len / this.rate;
    if (sec < this.targetSec) return;
    // RMS of this frame: cut when quiet, or force at target + 6 s.
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
    const rms = Math.sqrt(sum / Math.max(1, pcm.length)) / 32768;
    if (rms < 0.012 || sec > this.targetSec + 6) this.flush();
  }

  flush() {
    if (this.len < this.rate * 1.5) return; // <1.5 s: not worth a request
    const all = new Int16Array(this.len);
    let o = 0;
    for (const p of this.parts) {
      all.set(p, o);
      o += p.length;
    }
    this.parts = [];
    this.len = 0;
    this.onChunk(encodeWav(all, this.rate), this.startedAt);
  }
}

/** Float32 at any rate → Int16 at 16 kHz (box-filter decimation). */
export function to16k(input: Float32Array, inRate: number): Int16Array {
  const ratio = inRate / 16000;
  const n = Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += input[j];
    const v = s / Math.max(1, b - a);
    out[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
  }
  return out;
}
