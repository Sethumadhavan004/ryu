import type { Meeting } from "@ryu/core";
import { formatClock } from "@ryu/core";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Captions } from "../ui/Chrome";
import Animated from "react-native-reanimated";
import { openMeeting, processMeeting, startMeeting, toggleMute, wake } from "../lib/controller";
import { demoRun, demoStartFromButton } from "../lib/demo";
import { useRyu, type VoiceStatus } from "../state/store";
import { C, F, textGlow, web } from "../theme";
import { Core, type CoreMode } from "../ui/Core";
import { DecodeText } from "../ui/DecodeText";
import { easeOut, FADE_UP, ms } from "../ui/motion";
import { SystemButton } from "../ui/SystemButton";
import { SystemWindow } from "../ui/SystemWindow";

export const coreModeOf = (v: VoiceStatus): CoreMode =>
  v === "listening" || v === "muted" ? "listening" : v === "speaking" ? "speaking" : v === "thinking" || v === "connecting" ? "thinking" : v === "dormant" ? "dormant" : v === "unavailable" || v === "error" || v === "off" ? "offline" : "idle";

const HEADLINE: Record<VoiceStatus, string> = {
  listening: "LISTENING",
  speaking: "SPEAKING",
  thinking: "THINKING",
  connecting: "LINKING",
  dormant: "DORMANT",
  muted: "MUTED",
  unavailable: "TOUCH MODE",
  error: "LINK ERROR",
  off: "STANDBY",
};

export function Home({ compact, width, height }: { compact: boolean; width: number; height: number }) {
  const voice = useRyu((s) => s.voice);
  const voiceError = useRyu((s) => s.voiceError);
  const demo = useRyu((s) => s.demo);
  const meetings = useRyu((s) => s.meetings);
  const size = Math.round(Math.min(compact ? width * 0.78 : 440, height * (compact ? 0.36 : 0.5)));
  const canWake = voice === "dormant" || voice === "off" || voice === "error";

  const hint =
    voice === "unavailable"
      ? "Voice link isn't configured. Touch controls work; add LiveKit keys to talk to Ryu."
      : voice === "dormant"
        ? "Asleep after a quiet spell. Tap the core to wake Ryu."
        : voice === "error"
          ? voiceError ?? "The voice link failed. Tap the core to retry."
          : "Say “Start the meeting with Priya and Arjun”";

  const body = (
    <>
      <View style={compact ? styles.centerCompact : styles.center}>
        <Pressable disabled={!canWake} onPress={() => void wake()} style={web({ cursor: canWake ? "pointer" : "default" })} accessibilityLabel="Ryu core">
          <Core size={size} mode={coreModeOf(voice)} />
        </Pressable>
        <View style={styles.headline}>
          <DecodeText text={HEADLINE[voice]} style={[styles.state, textGlow(C.systemGlow, 16)]} />
          <Text style={styles.hint}>{hint}</Text>
        </View>
        <View style={styles.dock}>
          <SystemButton
            testID="start"
            label="Start meeting"
            size="lg"
            onPress={() => (demo ? void demoStartFromButton() : void startMeeting("Meeting", []))}
            hint={voice === "listening" ? "or just say it" : undefined}
          />
          {voice === "listening" || voice === "muted" ? (
            <SystemButton label={voice === "muted" ? "Unmute" : "Mute"} size="md" tone={voice === "muted" ? "danger" : "system"} onPress={() => void toggleMute()} />
          ) : null}
          {demo ? <SystemButton testID="demo-voice" label="Demo · voice" size="md" onPress={() => void demoRun()} hint="simulates the spoken command" /> : null}
        </View>
        {compact ? <Captions inline /> : null}
      </View>
      <Records meetings={meetings} compact={compact} />
    </>
  );
  return compact ? (
    <ScrollView contentContainerStyle={styles.wrapCompact}>{body}</ScrollView>
  ) : (
    <View style={styles.wrap}>{body}</View>
  );
}

function Records({ meetings, compact }: { meetings: Meeting[]; compact: boolean }) {
  return (
    <SystemWindow title="Records" glyph="◆" delay={200} compact style={[styles.records, compact && styles.recordsCompact]} bodyStyle={{ padding: 0 }}>
      <ScrollView style={{ maxHeight: compact ? 220 : 420 }} contentContainerStyle={{ padding: 6 }}>
        {meetings.length === 0 ? (
          <Text style={styles.empty}>No meetings yet. Your notes live on this device.</Text>
        ) : (
          meetings.slice(0, 20).map((m, i) => (
            <Animated.View key={m.id} style={{ animationName: FADE_UP, animationDuration: ms(360), animationDelay: ms(500 + i * 50), animationFillMode: "both", animationTimingFunction: easeOut }}>
              <Pressable
                onPress={() => (m.status === "failed" ? void processMeeting(m.id) : openMeeting(m.id))}
                style={(s) => [styles.rec, (s as { hovered?: boolean }).hovered && styles.recHover, web({ cursor: "pointer", transition: "background-color .15s" })]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.recTitle} numberOfLines={1}>{m.title}</Text>
                  <Text style={styles.recMeta}>
                    {new Date(m.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {formatClock(m.durationSec)}
                    {m.status === "ready" ? ` · ${m.note?.actions.length ?? 0} actions · ${1 + m.personNotes.length} notes` : ""}
                  </Text>
                </View>
                <Text style={[styles.badge, { color: m.status === "ready" ? C.gold : m.status === "failed" ? C.danger : C.systemHi }]}>
                  {m.status === "failed" ? "RETRY" : m.status === "ready" ? "READY" : m.status.toUpperCase()}
                </Text>
              </Pressable>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </SystemWindow>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  wrapCompact: { paddingHorizontal: 16, paddingBottom: 40, gap: 16, alignItems: "stretch" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  centerCompact: { alignItems: "center", gap: 6, paddingTop: 70 },
  headline: { alignItems: "center", gap: 8, marginTop: -8 },
  state: { fontFamily: F.display, fontSize: 20, letterSpacing: 9, color: C.ice, paddingLeft: 9 },
  hint: { fontFamily: F.body, fontSize: 14, color: C.muted, textAlign: "center", maxWidth: 420, lineHeight: 20 },
  dock: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 22 },
  records: { width: 330, position: "absolute", right: 24, top: 90 },
  recordsCompact: { position: "relative", right: 0, top: 0, width: "100%" },
  empty: { fontFamily: F.body, fontSize: 13, color: C.muted, padding: 10, lineHeight: 19 },
  rec: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 10 },
  recHover: { backgroundColor: "rgba(77,163,255,0.08)" },
  recTitle: { fontFamily: F.bodyMed, fontSize: 14, color: C.ice },
  recMeta: { fontFamily: F.mono, fontSize: 10.5, color: C.muted, marginTop: 2 },
  badge: { fontFamily: F.label, fontSize: 10, letterSpacing: 2 },
});
