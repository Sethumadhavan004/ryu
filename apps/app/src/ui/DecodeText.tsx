import { useEffect, useRef, useState } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/\\|[]{}";

/**
 * Text that resolves from noise, left to right — the System "writing" a label.
 * Only re-runs when `text` changes; costs one short interval, then nothing.
 */
export function DecodeText({ text, delay = 0, duration = 520, style }: { text: string; delay?: number; duration?: number; style?: StyleProp<TextStyle> }) {
  const [out, setOut] = useState(() => text.replace(/\S/g, " "));
  const raf = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let start = 0;
    const timeout = setTimeout(() => {
      start = Date.now();
      raf.current = setInterval(() => {
        const p = Math.min(1, (Date.now() - start) / duration);
        const n = Math.floor(p * text.length);
        let s = text.slice(0, n);
        for (let i = n; i < text.length; i++) {
          const ch = text[i];
          s += ch === " " ? " " : i < n + 4 ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : " ";
        }
        setOut(s);
        if (p >= 1 && raf.current) {
          clearInterval(raf.current);
          setOut(text);
        }
      }, 33);
    }, delay);
    return () => {
      clearTimeout(timeout);
      if (raf.current) clearInterval(raf.current);
    };
  }, [text, delay, duration]);

  return <Text style={style}>{out}</Text>;
}
