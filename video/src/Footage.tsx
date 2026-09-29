import type { ReactNode } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { type Cam, camera, H, type Key, remap, W } from "./camera";

export const LAST_FRAME = 2443;
const src = (n: number) => staticFile(`footage/f${String(Math.max(0, Math.min(LAST_FRAME, Math.round(n)))).padStart(5, "0")}.jpg`);

/**
 * One continuous piece of app footage: time-remapped (`pts`) and filmed by a
 * virtual camera (`keys`). Children render overlays with the live camera so
 * reticles stay locked to the UI while the camera moves.
 */
export function Footage({ pts, keys, dim = 0, blur = 0, children }: { pts: [number, number][]; keys: Key[]; dim?: number; blur?: number; children?: (cam: Cam, local: number) => ReactNode }) {
  const f = useCurrentFrame();
  const cam = camera(f, keys);
  const s = remap(f, pts);
  return (
    <AbsoluteFill style={{ backgroundColor: "#02050C", overflow: "hidden" }}>
      <Img
        src={src(s)}
        style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `translate(${cam.ox}px, ${cam.oy}px) scale(${cam.s})`, filter: blur > 0 ? `blur(${blur}px)` : undefined }}
      />
      {dim > 0 ? <AbsoluteFill style={{ backgroundColor: `rgba(2,5,12,${dim})` }} /> : null}
      {children?.(cam, f)}
    </AbsoluteFill>
  );
}

/** A single captured frame as a soft, dark backdrop for type-led scenes. */
export function Backdrop({ frame, blur = 22, brightness = 0.35, drift = 0 }: { frame: number; blur?: number; brightness?: number; drift?: number }) {
  const f = useCurrentFrame();
  const s = 1.08 + f * drift;
  return (
    <AbsoluteFill style={{ backgroundColor: "#02050C", overflow: "hidden" }}>
      <Img src={src(frame)} style={{ width: W, height: H, transform: `scale(${s})`, filter: `blur(${blur}px) brightness(${brightness}) saturate(1.2)` }} />
    </AbsoluteFill>
  );
}
