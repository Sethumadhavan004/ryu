import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { C } from "../theme";

/**
 * The void the System floats in (web): radial depth, a masked grid, rising
 * motes of light, and a vignette. Recording shifts the light to violet.
 * Motes are drawn on one canvas at ≤60 fps; ~70 particles, negligible cost.
 */
export function Background({ recording }: { recording: boolean }) {
  const cv = useRef<HTMLCanvasElement | null>(null);
  const rec = useRef(recording);
  rec.current = recording;

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    type P = { x: number; y: number; r: number; v: number; a: number; tw: number };
    let ps: P[] = [];
    let w = 0, h = 0, raf = 0, mix = 0;
    const reset = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(90, (w * h) / 16000));
      ps = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.4 + 0.3, v: Math.random() * 0.25 + 0.05, a: Math.random() * 0.6 + 0.15, tw: Math.random() * Math.PI * 2 }));
    };
    reset();
    window.addEventListener("resize", reset);
    const frame = (t: number) => {
      mix += ((rec.current ? 1 : 0) - mix) * 0.03;
      ctx.clearRect(0, 0, w, h);
      const r = Math.round(120 + 60 * mix), g = Math.round(190 - 60 * mix), b = 255;
      for (const p of ps) {
        p.y -= p.v;
        p.x += Math.sin(t / 3000 + p.tw) * 0.08;
        if (p.y < -4) {
          p.y = h + 4;
          p.x = Math.random() * w;
        }
        const a = p.a * (0.55 + 0.45 * Math.sin(t / 900 + p.tw));
        ctx.beginPath();
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.shadowColor = `rgba(${r},${g},${b},${a})`;
        ctx.shadowBlur = 6;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", reset);
    };
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.abyss }]} />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundImage: recording
              ? "radial-gradient(90% 70% at 50% 42%, rgba(70,40,160,0.42) 0%, rgba(20,10,60,0.35) 38%, transparent 72%)"
              : "radial-gradient(90% 70% at 50% 42%, rgba(24,70,170,0.40) 0%, rgba(8,26,70,0.32) 38%, transparent 72%)",
            transition: "background-image 1.2s ease",
          } as never,
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundImage:
              "linear-gradient(rgba(77,163,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(77,163,255,0.07) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            backgroundPosition: "center center",
            maskImage: "radial-gradient(70% 60% at 50% 45%, #000 10%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(70% 60% at 50% 45%, #000 10%, transparent 80%)",
          } as never,
        ]}
      />
      <canvas ref={cv} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" } as never} />
      <View style={[StyleSheet.absoluteFill, { backgroundImage: "radial-gradient(120% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.75) 100%)" } as never]} />
    </View>
  );
}
