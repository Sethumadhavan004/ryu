import { Platform, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useEffect } from "react";
import { enter } from "../lib/controller";
import { demoBoot, demoEnter } from "../lib/demo";
import { useRyu, type StepStatus } from "../state/store";
import { C, F, textGlow } from "../theme";
import { DecodeText } from "../ui/DecodeText";
import { easeOut, FADE_IN, FADE_UP, ms, PULSE } from "../ui/motion";
import { SystemButton } from "../ui/SystemButton";
import { SystemWindow } from "../ui/SystemWindow";

const MARK: Record<StepStatus, { t: string; c: string }> = {
  pending: { t: "· · ·", c: C.faint },
  active: { t: "LINKING", c: C.systemHi },
  done: { t: "ONLINE", c: C.ok },
  skip: { t: "STANDBY", c: C.muted },
  error: { t: "OFFLINE", c: C.danger },
};

export function Boot({ compact }: { compact: boolean }) {
  const boot = useRyu((s) => s.boot);
  const serverUp = useRyu((s) => s.serverUp);
  const demo = useRyu((s) => s.demo);
  const settled = boot.filter((b) => b.key !== "mic").every((b) => b.status !== "pending" && b.status !== "active");

  // Native has no autoplay gate: enter as soon as the System is up.
  useEffect(() => {
    if (settled && Platform.OS !== "web" && serverUp) void enter();
  }, [settled, serverUp]);

  const go = () => (demo ? demoEnter() : enter());
  const runDemo = async () => {
    await demoBoot();
    await demoEnter();
  };

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.hero, { animationName: FADE_IN, animationDuration: ms(900), animationFillMode: "both" }]}>
        <DecodeText text="RYU" duration={700} style={[styles.word, compact && { fontSize: 64, letterSpacing: 22 }, textGlow(C.systemGlow, 28)]} />
        <DecodeText text="VOICE-FIRST MEETING INTELLIGENCE" delay={300} duration={900} style={styles.sub} />
      </Animated.View>

      <SystemWindow title="System initialization" delay={250} style={[styles.win, compact && { width: "100%" }]}>
        {boot.map((b, i) => (
          <Animated.View
            key={b.key}
            style={[styles.row, { animationName: FADE_UP, animationDuration: ms(400), animationDelay: ms(650 + i * 90), animationFillMode: "both", animationTimingFunction: easeOut }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{b.label.toUpperCase()}</Text>
              {b.detail ? <Text style={styles.detail} numberOfLines={2}>{b.detail}</Text> : null}
            </View>
            <Animated.Text
              style={[
                styles.mark,
                { color: MARK[b.status].c },
                b.status === "active" ? { animationName: PULSE, animationDuration: ms(900), animationIterationCount: "infinite" } : null,
              ]}
            >
              {MARK[b.status].t}
            </Animated.Text>
          </Animated.View>
        ))}
      </SystemWindow>

      <View style={styles.actions}>
        {settled && Platform.OS === "web" && (serverUp || demo) ? (
          <Animated.View style={{ alignItems: "center", animationName: FADE_UP, animationDuration: ms(500), animationFillMode: "both", animationTimingFunction: easeOut }}>
            <SystemButton testID="enter" label="Enter" size="lg" onPress={go} hint="Ryu starts listening the moment you enter" />
          </Animated.View>
        ) : null}
        {settled && serverUp === false && !demo ? (
          <Animated.View style={{ alignItems: "center", gap: 12, animationName: FADE_UP, animationDuration: ms(500), animationFillMode: "both" }}>
            <Text style={styles.warn}>The Ryu server isn't reachable. Start it with `npm run dev`, or explore the full flow in demo mode.</Text>
            <SystemButton testID="demo" label="Run demo" size="lg" onPress={runDemo} hint="Scripted meeting · no keys needed" />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, gap: 28 },
  hero: { alignItems: "center", gap: 6 },
  word: { fontFamily: F.displayBold, fontSize: 88, letterSpacing: 30, color: C.ice, paddingLeft: 30 },
  sub: { fontFamily: F.label, fontSize: 11.5, letterSpacing: 5, color: C.systemHi, opacity: 0.85 },
  win: { width: 460 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(77,163,255,0.1)", gap: 12 },
  label: { fontFamily: F.label, fontSize: 12, letterSpacing: 2.4, color: C.ice },
  detail: { fontFamily: F.mono, fontSize: 10.5, color: C.muted, marginTop: 3 },
  mark: { fontFamily: F.label, fontSize: 10.5, letterSpacing: 2.2 },
  actions: { minHeight: 90, alignItems: "center", justifyContent: "center" },
  warn: { fontFamily: F.body, fontSize: 13.5, color: C.text, textAlign: "center", maxWidth: 440, lineHeight: 20 },
});
