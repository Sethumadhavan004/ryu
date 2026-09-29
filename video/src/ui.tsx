import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { type Cam, project } from "./camera";
import { C, F, easeOut } from "./theme";

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** 0→1 on the way in, 1→0 on the way out, for an element visible in [from, to). */
export function presence(frame: number, from: number, to: number, inDur = 14, outDur = 10) {
  return Math.min(easeOut((frame - from) / inDur), 1 - clamp01((frame - (to - outDur)) / outDur));
}

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#<>/\\=+*";

/** Text that resolves from scrambled glyphs, like the app's DecodeText. */
export function Decode({ text, start, dur = 18, seed = "d" }: { text: string; start: number; dur?: number; seed?: string }) {
  const frame = useCurrentFrame();
  const p = clamp01((frame - start) / dur);
  const shown = Math.floor(p * text.length);
  return (
    <>
      {text.split("").map((ch, i) => {
        if (ch === " " || i < shown) return <span key={i}>{ch}</span>;
        if (frame < start) return <span key={i} style={{ opacity: 0 }}>{ch}</span>;
        const g = GLYPHS[Math.floor(random(`${seed}-${i}-${Math.floor(frame / 2)}`) * GLYPHS.length)];
        return (
          <span key={i} style={{ color: C.systemHi, opacity: 0.75 }}>
            {g}
          </span>
        );
      })}
    </>
  );
}

/** A System window: ink title bar with a chapter tag, glowing hairline, body copy. */
export function Callout({
  from,
  to,
  x,
  y,
  width = 520,
  tag,
  title,
  children,
  tone = "system",
  align = "left",
}: {
  from: number;
  to: number;
  x: number;
  y: number;
  width?: number;
  tag?: string;
  title: string;
  children?: ReactNode;
  tone?: "system" | "shadow" | "gold";
  align?: "left" | "right";
}) {
  const frame = useCurrentFrame();
  const p = presence(frame, from, to);
  if (p <= 0) return null;
  const col = tone === "gold" ? C.gold : tone === "shadow" ? C.shadowHi : C.system;
  const glow = tone === "gold" ? C.goldGlow : tone === "shadow" ? C.shadowGlow : C.systemGlow;
  const reveal = clamp01((frame - from) / 12);
  return (
    <div
      style={{
        position: "absolute",
        left: align === "left" ? x : undefined,
        right: align === "right" ? 1920 - x : undefined,
        top: y,
        width,
        opacity: p,
        transform: `translateY(${(1 - p) * 14}px)`,
        clipPath: `inset(0 ${(1 - easeOut(reveal)) * 100}% 0 0)`,
        background: "linear-gradient(180deg, rgba(8,20,48,0.92), rgba(4,10,24,0.94))",
        border: `1px solid ${col}`,
        boxShadow: `0 0 0 1px rgba(40,120,255,0.12), 0 0 28px ${glow}, inset 0 0 30px rgba(56,140,255,0.10)`,
        backdropFilter: "blur(10px)",
      }}
    >
      <Brackets color={col} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 18px",
          borderBottom: `1px solid ${col}44`,
          fontFamily: F.display,
          fontWeight: 600,
          fontSize: 20,
          letterSpacing: 3.2,
          color: C.ice,
          textTransform: "uppercase",
        }}
      >
        {tag ? (
          <span style={{ fontFamily: F.mono, fontSize: 15, letterSpacing: 1.5, color: col, border: `1px solid ${col}88`, padding: "2px 7px" }}>{tag}</span>
        ) : null}
        <span>
          <Decode text={title} start={from + 3} dur={16} seed={title} />
        </span>
      </div>
      {children ? (
        <div style={{ padding: "14px 18px 17px", fontFamily: F.body, fontSize: 24, lineHeight: 1.42, color: C.text, opacity: clamp01((frame - from - 8) / 10) }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function Brackets({ color, size = 12, inset = -1 }: { color: string; size?: number; inset?: number }) {
  const b = `2px solid ${color}`;
  const s: CSSProperties = { position: "absolute", width: size, height: size };
  return (
    <>
      <div style={{ ...s, left: inset, top: inset, borderLeft: b, borderTop: b }} />
      <div style={{ ...s, right: inset, top: inset, borderRight: b, borderTop: b }} />
      <div style={{ ...s, left: inset, bottom: inset, borderLeft: b, borderBottom: b }} />
      <div style={{ ...s, right: inset, bottom: inset, borderRight: b, borderBottom: b }} />
    </>
  );
}

/** A targeting reticle locked to a footage region, projected through the camera. */
export function Target({ cam, from, to, x, y, w, h, color = C.systemHi, label }: { cam: Cam; from: number; to: number; x: number; y: number; w: number; h: number; color?: string; label?: string }) {
  const frame = useCurrentFrame();
  const p = presence(frame, from, to, 12, 8);
  if (p <= 0) return null;
  const a = project(cam, x, y);
  const pad = 10 + (1 - p) * 40;
  const bw = w * cam.s + pad * 2;
  const bh = h * cam.s + pad * 2;
  return (
    <div style={{ position: "absolute", left: a.x - pad, top: a.y - pad, width: bw, height: bh, opacity: p }}>
      <Brackets color={color} size={22} />
      <div style={{ position: "absolute", inset: 0, boxShadow: `0 0 40px ${color}33, inset 0 0 30px ${color}22` }} />
      {label ? (
        <div style={{ position: "absolute", left: 0, top: -34, fontFamily: F.mono, fontSize: 17, letterSpacing: 2, color, textShadow: `0 0 10px ${color}` }}>
          ◆ {label}
        </div>
      ) : null}
    </div>
  );
}

/** Chapter chip, top-left: "03 · CAPTURE". */
export function Chapter({ n, name, from, to }: { n: string; name: string; from: number; to: number }) {
  const frame = useCurrentFrame();
  const p = presence(frame, from, to, 16, 12);
  if (p <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 64, bottom: 60, display: "flex", alignItems: "center", gap: 16, opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>
      <div style={{ fontFamily: F.mono, fontSize: 20, color: C.system, border: `1px solid ${C.system}`, padding: "4px 10px", boxShadow: `0 0 18px ${C.systemGlow}` }}>{n}</div>
      <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 26, letterSpacing: 8, color: C.ice, textShadow: `0 0 14px ${C.systemGlow}` }}>
        <Decode text={name} start={from + 4} dur={14} seed={name} />
      </div>
      <div style={{ width: interpolate(p, [0, 1], [0, 140]), height: 1, background: `linear-gradient(90deg, ${C.system}, transparent)` }} />
    </div>
  );
}

/** Kinetic headline: words rise out of blur, one after another. */
export function Kinetic({ text, start, size = 72, color = C.ice, weight = 600, stagger = 4, font = F.display, spacing = 2, highlight = {} as Record<string, string> }: { text: string; start: number; size?: number; color?: string; weight?: number; stagger?: number; font?: string; spacing?: number; highlight?: Record<string, string> }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: `0 ${size * 0.28}px`, fontFamily: font, fontWeight: weight, fontSize: size, letterSpacing: spacing, lineHeight: 1.15 }}>
      {text.split(" ").map((w, i) => {
        const t = clamp01((frame - start - i * stagger) / 16);
        const e = easeOut(t);
        const hc = highlight[w.replace(/[^\w+]/g, "").toLowerCase()];
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: e,
              transform: `translateY(${(1 - e) * 26}px)`,
              filter: `blur(${(1 - e) * 10}px)`,
              color: hc ?? color,
              textShadow: hc ? `0 0 24px ${hc}88` : `0 0 18px ${C.systemGlow}`,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
}

/** Pointer with a click ripple, moving in from the lower right. */
export function Cursor({ x, y, clickAt, from, to }: { x: number; y: number; clickAt: number; from: number; to: number }) {
  const frame = useCurrentFrame();
  const p = presence(frame, from, to, 10, 10);
  if (p <= 0) return null;
  const travel = easeOut((frame - from) / Math.max(1, clickAt - from));
  const cx = x + (1 - travel) * 180;
  const cy = y + (1 - travel) * 120;
  const r = frame - clickAt;
  const press = r >= 0 && r < 5 ? 0.86 : 1;
  return (
    <>
      {r >= 0 && r < 22 ? (
        <div
          style={{
            position: "absolute",
            left: x - 10 - r * 2.4,
            top: y - 10 - r * 2.4,
            width: 20 + r * 4.8,
            height: 20 + r * 4.8,
            borderRadius: "50%",
            border: `2px solid ${C.systemHi}`,
            opacity: 1 - r / 22,
            boxShadow: `0 0 20px ${C.systemGlow}`,
          }}
        />
      ) : null}
      <svg width={34} height={40} viewBox="0 0 34 40" style={{ position: "absolute", left: cx - 4, top: cy - 3, opacity: p, transform: `scale(${press})`, transformOrigin: "4px 3px", filter: "drop-shadow(0 4px 10px rgba(0,0,0,.6))" }}>
        <path d="M4 3 L4 31 L11.5 24.5 L16.5 36 L21.5 33.8 L16.6 22.6 L26.5 22.6 Z" fill={C.ice} stroke={C.abyss} strokeWidth={1.8} strokeLinejoin="round" />
      </svg>
    </>
  );
}

/** Vignette + fine animated grain + faint scanlines: one consistent finish over everything. */
export function Finish() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
      <AbsoluteFill style={{ opacity: 0.05, mixBlendMode: "overlay" }}>
        <svg width="1920" height="1080">
          <filter id="g">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={frame % 12} />
          </filter>
          <rect width="1920" height="1080" filter="url(#g)" />
        </svg>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: 0.035, backgroundImage: "repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 3px)" }} />
    </AbsoluteFill>
  );
}

/** Small, honest provenance note shown over app footage. */
export function DemoNote({ opacity }: { opacity: number }) {
  return (
    <div style={{ position: "absolute", right: 48, bottom: 40, fontFamily: F.mono, fontSize: 15, letterSpacing: 1.5, color: C.muted, opacity }}>
      CAPTURED FROM RYU'S BUILT-IN DEMO MODE · SCRIPTED MEETING
    </div>
  );
}
