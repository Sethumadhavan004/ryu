import { useEffect, useState } from "react";
import { View } from "react-native";
import { sampleLevels } from "../state/levels";

/** Scrolling level bars (native, ~20 fps — cheap and readable). */
export function Waveform({ height = 64, color = "#BBA4FF" }: { height?: number; color?: string }) {
  const [hist, setHist] = useState<number[]>(() => Array(48).fill(0));
  useEffect(() => {
    const t = setInterval(() => setHist((h) => [...h.slice(1), sampleLevels().input]), 50);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ height, flexDirection: "row", alignItems: "center", gap: 2 }}>
      {hist.map((v, i) => (
        <View key={i} style={{ flex: 1, height: Math.max(2, v * (height - 6)), backgroundColor: color, opacity: 0.25 + (i / hist.length) * 0.75 }} />
      ))}
    </View>
  );
}
