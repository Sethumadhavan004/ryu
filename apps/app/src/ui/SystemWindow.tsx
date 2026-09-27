import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { C, F, glow, textGlow, web } from "../theme";
import { DecodeText } from "./DecodeText";
import { easeOut, FADE_IN, ms, WINDOW_OPEN } from "./motion";

export type Tone = "system" | "shadow" | "gold" | "danger";

export const TONE: Record<Tone, { line: string; hi: string; glow: string; fill: [string, string] }> = {
  system: { line: "rgba(110,185,255,0.85)", hi: C.systemHi, glow: C.systemGlow, fill: ["rgba(12,32,72,0.86)", "rgba(5,14,34,0.9)"] },
  shadow: { line: "rgba(160,130,255,0.85)", hi: C.shadowHi, glow: C.shadowGlow, fill: ["rgba(34,18,78,0.86)", "rgba(10,6,30,0.9)"] },
  gold: { line: "rgba(255,214,140,0.85)", hi: C.gold, glow: C.goldGlow, fill: ["rgba(48,36,14,0.8)", "rgba(12,10,6,0.9)"] },
  danger: { line: "rgba(255,110,130,0.9)", hi: "#FF9AAB", glow: "rgba(255,77,106,0.5)", fill: ["rgba(64,12,24,0.86)", "rgba(20,4,10,0.9)"] },
};

const SOLID: Record<Tone, [string, string]> = {
  system: ["#0B1D42", "#050E22"],
  shadow: ["#1C1042", "#0A0620"],
  gold: ["#221B0E", "#0B0906"],
  danger: ["#2E0A14", "#12040A"],
};

interface Props {
  title?: string;
  /** "!" = the System's notification glyph; "◆" = neutral panel. */
  glyph?: string;
  tone?: Tone;
  right?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  delay?: number;
  /** Re-run the open animation when this changes. */
  animKey?: string | number;
  compact?: boolean;
  decode?: boolean;
  /** Opaque fill — for reading surfaces layered over other windows. */
  solid?: boolean;
}

/**
 * The System window. Everything Ryu shows lives in one of these.
 * Opening is the signature motion: a line of light unfolds, then the
 * content resolves (Research 04 principle 2: motion reflects real state).
 */
export function SystemWindow({ title, glyph = "!", tone = "system", right, children, style, bodyStyle, delay = 0, animKey, compact, decode = true, solid }: Props) {
  const t = TONE[tone];
  return (
    <Animated.View
      key={animKey}
      style={[
        styles.frame,
        {
          borderColor: t.line,
          boxShadow: glow(t.glow, 22),
          animationName: WINDOW_OPEN,
          animationDuration: ms(640),
          animationDelay: ms(delay),
          animationTimingFunction: easeOut,
          animationFillMode: "both",
        },
        web({ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }),
        style,
      ]}
    >
      <LinearGradient colors={solid ? SOLID[tone] : t.fill} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scan, web({ backgroundImage: "repeating-linear-gradient(0deg, rgba(140,203,255,0.035) 0 1px, transparent 1px 3px)" })]} />
      <Corners color={t.hi} />
      {title !== undefined && (
        <View style={[styles.header, compact && styles.headerCompact]}>
          <View style={[styles.glyph, { borderColor: t.hi }]}>
            <Text style={[styles.glyphText, { color: t.hi }]}>{glyph}</Text>
          </View>
          {decode ? (
            <DecodeText text={title.toUpperCase()} delay={delay + 280} style={[styles.title, compact && styles.titleCompact, textGlow(t.glow, 10)]} />
          ) : (
            <Text style={[styles.title, compact && styles.titleCompact, textGlow(t.glow, 10)]}>{title.toUpperCase()}</Text>
          )}
          <View style={{ flex: 1 }} />
          {right}
        </View>
      )}
      {title !== undefined && (
        <LinearGradient colors={["transparent", t.line, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rule} />
      )}
      <Animated.View
        style={[
          styles.body,
          compact && styles.bodyCompact,
          { animationName: FADE_IN, animationDuration: ms(420), animationDelay: ms(delay + 380), animationFillMode: "both", animationTimingFunction: easeOut },
          bodyStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

function Corners({ color }: { color: string }) {
  const s = { borderColor: color };
  return (
    <>
      <View pointerEvents="none" style={[styles.corner, { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 }, s]} />
      <View pointerEvents="none" style={[styles.corner, { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 }, s]} />
      <View pointerEvents="none" style={[styles.corner, { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 }, s]} />
      <View pointerEvents="none" style={[styles.corner, { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 }, s]} />
    </>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, overflow: "hidden", borderRadius: 2 },
  scan: { opacity: 1 },
  corner: { position: "absolute", width: 12, height: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  headerCompact: { paddingHorizontal: 12, paddingTop: 9, paddingBottom: 8, gap: 8 },
  glyph: { width: 18, height: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  glyphText: { fontFamily: F.displayBold, fontSize: 11, lineHeight: 13 },
  title: { fontFamily: F.display, fontSize: 13, letterSpacing: 3.2, color: C.ice },
  titleCompact: { fontSize: 11.5, letterSpacing: 2.6 },
  rule: { height: 1, marginHorizontal: 10, opacity: 0.8 },
  body: { padding: 14, flexGrow: 1, flexShrink: 1, minHeight: 0 },
  bodyCompact: { padding: 12 },
});
