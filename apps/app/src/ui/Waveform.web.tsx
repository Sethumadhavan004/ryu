import { useEffect, useRef } from "react";
import { sampleLevels } from "../state/levels";

/** Scrolling mirrored level bars (web canvas, 60 fps). */
export function Waveform({ height = 64, color = "#BBA4FF" }: { height?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const hist: number[] = [];
    let raf = 0, sm = 0, acc = 0, last = performance.now();
    const frame = (t: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      sm += (sampleLevels().input - sm) * 0.35;
      acc += t - last;
      last = t;
      if (acc > 33) {
        acc = 0;
        hist.push(sm);
      }
      const bw = 3, gap = 2, n = Math.floor(w / (bw + gap));
      while (hist.length > n) hist.shift();
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "rgba(187,164,255,0.1)");
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      hist.forEach((v, i) => {
        const x = w - (hist.length - i) * (bw + gap);
        const bh = Math.max(2, v * (h - 6));
        ctx.fillRect(x, (h - bh) / 2, bw, bh);
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [color]);
  return <canvas ref={ref} style={{ width: "100%", height, display: "block" }} />;
}
