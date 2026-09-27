import { useRyu } from "../state/store";

/**
 * Tiny synthesized UI sounds (web). No assets: two soft sine partials with a
 * fast attack and exponential tail — the System's "chime".
 */
let ctx: AudioContext | null = null;
const ac = () => (ctx ??= new AudioContext());

function tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + at);
  g.gain.setValueAtTime(0, c.currentTime + at);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + at);
  o.stop(c.currentTime + at + dur + 0.05);
}

export const sound = {
  /** Call from a user gesture: unlocks audio for the whole session. */
  unlock() {
    void ac().resume();
  },
  play(kind: "open" | "notice" | "rec" | "stop" | "done" | "error") {
    if (!useRyu.getState().soundOn) return;
    try {
      switch (kind) {
        case "open":
          tone(1320, 0, 0.18, 0.035);
          break;
        case "notice":
          tone(988, 0, 0.35, 0.05);
          tone(1480, 0.07, 0.5, 0.04);
          break;
        case "rec":
          tone(440, 0, 0.5, 0.05, "triangle");
          tone(660, 0.09, 0.6, 0.04);
          break;
        case "stop":
          tone(660, 0, 0.3, 0.05, "triangle");
          tone(440, 0.08, 0.45, 0.04);
          break;
        case "done":
          [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.6, 0.035));
          break;
        case "error":
          tone(220, 0, 0.4, 0.06, "square");
          break;
      }
    } catch {}
  },
};
