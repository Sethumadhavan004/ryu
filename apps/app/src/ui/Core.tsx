import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { sampleLevels } from "../state/levels";
import { SPIN, SPIN_REV, ms } from "./motion";

/**
 * Ryu's presence (native). Radial-gradient core that breathes with the real
 * audio level + rotating rings. The web build uses a WebGL shader instead
 * (Core.web.tsx); both read the same level stream.
 */
export type CoreMode = "idle" | "listening" | "speaking" | "thinking" | "recording" | "dormant" | "offline";

const COLORS: Record<CoreMode, [string, string, number]> = {
  idle: ["#4DA3FF", "#BFE3FF", 0.85],
  listening: ["#4DA3FF", "#CFEAFF", 1],
  speaking: ["#6FB8FF", "#FFFFFF", 1],
  thinking: ["#6A7CFF", "#C3B4FF", 1],
  recording: ["#8B63FF", "#E3D8FF", 1],
  dormant: ["#1F4E99", "#5D82B8", 0.45],
  offline: ["#3A4A66", "#6D7A90", 0.5],
};

export function Core({ size, mode }: { size: number; mode: CoreMode }) {
  const level = useSharedValue(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { input, output } = sampleLevels();
      level.value = withTiming(mode === "speaking" ? output : Math.max(input * 0.8, output), { duration: 90 });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, level]);

  const core = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + level.value * 0.28 }], opacity: 0.85 + level.value * 0.15 }));
  const [a, b, dim] = COLORS[mode];
  const ring = (scale: number, dur: number, rev: boolean, color: string, dash: string, w = 1) => (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }], animationName: rev ? SPIN_REV : SPIN, animationDuration: ms(dur), animationIterationCount: "infinite", animationTimingFunction: "linear" }]}>
      <Svg viewBox="0 0 200 200" width="100%" height="100%">
        <Circle cx={100} cy={100} r={96} fill="none" stroke={color} strokeWidth={w} strokeDasharray={dash} />
      </Svg>
    </Animated.View>
  );
  return (
    <View style={{ width: size, height: size, opacity: dim }} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, core]}>
        <Svg viewBox="0 0 200 200" width="100%" height="100%">
          <Defs>
            <RadialGradient id="g" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={b} stopOpacity={1} />
              <Stop offset="0.35" stopColor={a} stopOpacity={0.95} />
              <Stop offset="0.6" stopColor={a} stopOpacity={0.25} />
              <Stop offset="1" stopColor={a} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={100} cy={100} r={62} fill="url(#g)" />
        </Svg>
      </Animated.View>
      {ring(1, 42000, false, `${a}55`, "1 5")}
      {ring(0.86, 26000, true, `${a}99`, "70 18 6 18", 1.2)}
      {ring(0.74, 11000, false, a, "26 300", 2)}
    </View>
  );
}
