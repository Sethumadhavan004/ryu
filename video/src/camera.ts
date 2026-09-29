import { Easing, interpolate } from "remotion";

export const W = 1920;
export const H = 1080;

/** A camera keyframe: at scene-local frame `f`, zoom `s` centred on footage point (x, y). */
export interface Key {
  f: number;
  s: number;
  x: number;
  y: number;
}
export interface Cam {
  s: number;
  ox: number;
  oy: number;
}

const ease = Easing.inOut(Easing.cubic);

/** Eased camera between keyframes, clamped so the footage always covers the frame. */
export function camera(frame: number, keys: Key[]): Cam {
  const ks = keys.length ? keys : [{ f: 0, s: 1, x: W / 2, y: H / 2 }];
  let s = ks[0].s,
    x = ks[0].x,
    y = ks[0].y;
  if (frame >= ks[ks.length - 1].f) ({ s, x, y } = ks[ks.length - 1]);
  else
    for (let i = 0; i < ks.length - 1; i++) {
      const a = ks[i],
        b = ks[i + 1];
      if (frame >= a.f && frame < b.f) {
        const t = ease((frame - a.f) / (b.f - a.f));
        s = a.s + (b.s - a.s) * t;
        x = a.x + (b.x - a.x) * t;
        y = a.y + (b.y - a.y) * t;
        break;
      }
    }
  const ox = Math.min(0, Math.max(W - W * s, W / 2 - x * s));
  const oy = Math.min(0, Math.max(H - H * s, H / 2 - y * s));
  return { s, ox, oy };
}

/** Footage point → screen point under the camera. */
export const project = (c: Cam, x: number, y: number) => ({ x: c.ox + x * c.s, y: c.oy + y * c.s });

/**
 * Time remap: scene-local frame → captured frame, piecewise linear through
 * [local, source] points. This is where speed ramps and slow-motion live.
 */
export function remap(local: number, pts: [number, number][]): number {
  return interpolate(
    local,
    pts.map((p) => p[0]),
    pts.map((p) => p[1]),
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

/** Inverse of remap: the scene-local frame at which source frame `src` is shown (or null). */
export function unmap(src: number, pts: [number, number][]): number | null {
  for (let i = 0; i < pts.length - 1; i++) {
    const [l0, s0] = pts[i];
    const [l1, s1] = pts[i + 1];
    if (src >= s0 && src <= s1 && s1 > s0) return l0 + ((src - s0) / (s1 - s0)) * (l1 - l0);
  }
  return null;
}
