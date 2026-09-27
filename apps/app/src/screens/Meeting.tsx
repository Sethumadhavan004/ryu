import { formatClock } from "@ryu/core";
import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { addTabAudio, stopMeeting } from "../lib/controller";
import { demoStop } from "../lib/demo";
import { useRyu } from "../state/store";
import { C, F, textGlow } from "../theme";
import { Core } from "../ui/Core";
import { Empty, KIND } from "../ui/Items";
import { easeOut, FADE_UP, ms } from "../ui/motion";
import { SystemButton } from "../ui/SystemButton";
import { SystemWindow } from "../ui/SystemWindow";
import { Waveform } from "../ui/Waveform";

/** Meeting HUD: the System boots its capture windows around a violet core. */
export function Meeting({ compact }: { compact: boolean }) {
  const live = useRyu((s) => s.live);
  const demo = useRyu((s) => s.demo);
  const [now, setNow] = useState(Date.now());
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!live) return null;
  const elapsed = (now - live.startedAt) / 1000;
  const stop = () => {
    setStopping(true);
    if (demo) demoStop();
    else void stopMeeting();
  };

  const transcript = (
    <SystemWindow title="Transcript · live draft" delay={0} style={[styles.fill, compact && { flex: 1.3 }]} bodyStyle={{ padding: 0 }} right={<Text style={styles.engine}>{live.draftEngine ?? "~30 s chunks"}</Text>}>
      <Draft lines={live.draft} />
    </SystemWindow>
  );
  const ledger = (
    <SystemWindow title="Live ledger" delay={120} tone="system" style={styles.fill} right={<Text style={styles.prov}>PROVISIONAL</Text>} bodyStyle={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {live.atoms.length === 0 ? (
          <Empty>Decisions, action items and open questions surface here as they're said. The verified ledger is built when you stop.</Empty>
        ) : (
          live.atoms.map((a) => (
            <Animated.View key={a.id} style={[styles.atom, { animationName: FADE_UP, animationDuration: ms(450), animationTimingFunction: easeOut }]}>
              <Text style={[styles.kind, { color: KIND[a.kind].color, borderColor: KIND[a.kind].color }]}>{KIND[a.kind].label}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.atomText}>{a.text}</Text>
                <Text style={styles.atomAt}>heard at {a.at}</Text>
              </View>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </SystemWindow>
  );
  const signal = (
    <SystemWindow title="Signal" tone="shadow" delay={240} style={compact ? undefined : { width: "100%" }}>
      <Waveform height={compact ? 40 : 58} />
      <View style={styles.timerRow}>
        <Text style={[styles.timer, compact && { fontSize: 34 }, textGlow(C.shadowGlow, 18)]}>{formatClock(elapsed)}</Text>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.recLabel}>● REC</Text>
          <Text style={styles.meta}>{live.tabAudio ? "mic + tab audio" : "microphone"}</Text>
        </View>
      </View>
      {live.participants.length ? <Text style={styles.people}>WITH {live.participants.join(" · ").toUpperCase()}</Text> : null}
      <View style={{ gap: 8, marginTop: 12 }}>
        <SystemButton testID="stop" label={stopping ? "Stopping…" : "Stop meeting"} tone="shadow" size="lg" onPress={stop} disabled={stopping} />
        {Platform.OS === "web" && !demo && !live.tabAudio ? <SystemButton label="+ Tab audio" size="sm" onPress={() => void addTabAudio()} hint="for Meet / Zoom in a browser tab" /> : null}
      </View>
    </SystemWindow>
  );

  if (compact) {
    return (
      <View style={styles.compact}>
        {signal}
        {transcript}
        {ledger}
      </View>
    );
  }
  return (
    <View style={styles.grid}>
      <View style={{ flex: 1.25, minHeight: 0 }}>{transcript}</View>
      <View style={styles.mid}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Core size={230} mode="recording" />
          <Text style={[styles.title, textGlow(C.shadowGlow, 12)]} numberOfLines={1}>{live.title.toUpperCase()}</Text>
        </View>
        {signal}
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>{ledger}</View>
    </View>
  );
}

function Draft({ lines }: { lines: { t: number; text: string }[] }) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    ref.current?.scrollToEnd({ animated: true });
  }, [lines.length]);
  return (
    <ScrollView ref={ref} contentContainerStyle={{ padding: 12 }}>
      {lines.length === 0 ? (
        <Empty>Listening. The first lines land within about thirty seconds — the live draft is transcribed in chunks, then replaced by a diarized final pass.</Empty>
      ) : (
        lines.map((l, i) => (
          <Animated.View key={i} style={[styles.line, { animationName: FADE_UP, animationDuration: ms(420), animationTimingFunction: easeOut }]}>
            <Text style={styles.t}>{formatClock(l.t)}</Text>
            <Text style={styles.lineText}>{l.text}</Text>
          </Animated.View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1, flexDirection: "row", gap: 16, paddingHorizontal: 24, paddingTop: 76, paddingBottom: 24 },
  compact: { flex: 1, gap: 10, paddingHorizontal: 12, paddingTop: 96, paddingBottom: 12 },
  fill: { flex: 1, minHeight: 0 },
  mid: { width: 330, gap: 16 },
  title: { fontFamily: F.display, fontSize: 14, letterSpacing: 5, color: C.shadowHi, marginTop: 10, maxWidth: 300 },
  engine: { fontFamily: F.mono, fontSize: 10, color: C.faint },
  prov: { fontFamily: F.label, fontSize: 9.5, letterSpacing: 2, color: C.muted },
  line: { flexDirection: "row", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(77,163,255,0.08)" },
  t: { fontFamily: F.mono, fontSize: 11, color: C.muted, width: 40, marginTop: 2 },
  lineText: { flex: 1, fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.text },
  atom: { flexDirection: "row", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(77,163,255,0.08)" },
  kind: { fontFamily: F.label, fontSize: 9, letterSpacing: 1.6, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2, alignSelf: "flex-start", marginTop: 2 },
  atomText: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.ice },
  atomAt: { fontFamily: F.mono, fontSize: 10, color: C.faint, marginTop: 3 },
  timerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8 },
  timer: { fontFamily: F.display, fontSize: 46, color: C.ice, letterSpacing: 3 },
  recLabel: { fontFamily: F.label, fontSize: 11, letterSpacing: 2.4, color: C.shadowHi },
  meta: { fontFamily: F.mono, fontSize: 10.5, color: C.muted, marginTop: 3 },
  people: { fontFamily: F.label, fontSize: 10.5, letterSpacing: 2.2, color: C.text, marginTop: 8 },
});
