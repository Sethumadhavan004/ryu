import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useRyu, type Phase, type VoiceStatus } from "../state/store";
import { C, F, glow, textGlow, web } from "../theme";
import { easeOut, FADE_UP, ms, PULSE } from "./motion";
import { SystemWindow, TONE, type Tone } from "./SystemWindow";

// ── Status chip: one glance tells you who is listening (principle 4) ──────

function statusOf(voice: VoiceStatus, phase: Phase): { text: string; tone: Tone; live: boolean } {
  if (phase === "meeting") return { text: "REC · RYU NOT LISTENING", tone: "shadow", live: true };
  if (phase === "processing") return { text: "ANALYZING · MIC OFF", tone: "system", live: false };
  switch (voice) {
    case "listening": return { text: "RYU · LISTENING", tone: "system", live: true };
    case "speaking": return { text: "RYU · SPEAKING", tone: "system", live: true };
    case "thinking": return { text: "RYU · THINKING", tone: "system", live: true };
    case "connecting": return { text: "LINKING…", tone: "system", live: false };
    case "dormant": return { text: "DORMANT · TAP THE CORE", tone: "system", live: false };
    case "muted": return { text: "MIC MUTED", tone: "danger", live: false };
    case "unavailable": return { text: "VOICE OFFLINE · TOUCH MODE", tone: "system", live: false };
    case "error": return { text: "VOICE LINK ERROR", tone: "danger", live: false };
    default: return { text: "MIC OFF", tone: "system", live: false };
  }
}

export function StatusChip() {
  const voice = useRyu((s) => s.voice);
  const phase = useRyu((s) => s.phase);
  const st = statusOf(voice, phase);
  const t = TONE[st.tone];
  return (
    <View style={[styles.chip, { borderColor: t.line, boxShadow: glow(t.glow, 14, false) }, web({ backdropFilter: "blur(8px)", transition: "border-color .4s, box-shadow .4s" })]}>
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: st.live ? t.hi : C.faint, boxShadow: st.live ? `0 0 10px ${t.hi}` : "none" },
          st.live ? { animationName: PULSE, animationDuration: ms(1600), animationIterationCount: "infinite" } : null,
        ]}
      />
      <Text style={[styles.chipText, { color: st.live ? C.ice : C.muted }]}>{st.text}</Text>
    </View>
  );
}

// ── Top bar ─────────────────────────────────────────────────────────────────

export function TopBar({ compact }: { compact: boolean }) {
  const soundOn = useRyu((s) => s.soundOn);
  const demo = useRyu((s) => s.demo);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={[styles.top, compact && styles.topCompact]}>
      <View style={styles.brand}>
        <Text style={[styles.word, textGlow(C.systemGlow, 14)]}>RYU</Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{demo ? "DEMO" : "SYSTEM"}</Text>
        </View>
      </View>
      {!compact && <StatusChip />}
      <View style={styles.right}>
        {!compact && (
          <Text style={styles.clock}>
            {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}
            {"  "}
            <Text style={{ color: C.ice }}>{now.toLocaleTimeString([], { hour12: false })}</Text>
          </Text>
        )}
        <Pressable accessibilityLabel="Toggle sound" onPress={() => useRyu.getState().set({ soundOn: !soundOn })} style={[styles.icon, web({ cursor: "pointer" })]}>
          <Text style={[styles.iconText, { color: soundOn ? C.systemHi : C.faint }]}>{soundOn ? "SFX ON" : "SFX OFF"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Captions: what Ryu heard, what Ryu says ─────────────────────────────────

export function Captions({ inline }: { inline?: boolean }) {
  const captions = useRyu((s) => s.captions);
  const you = captions.find((c) => c.who === "you");
  const ryu = captions.find((c) => c.who === "ryu");
  return (
    <View style={[inline ? styles.captionsInline : styles.captions, !inline && web({ backgroundImage: "radial-gradient(60% 100% at 50% 60%, rgba(2,5,12,0.85) 0%, rgba(2,5,12,0.55) 55%, transparent 100%)", paddingVertical: 14 })]} pointerEvents="none">
      {you ? (
        <Animated.Text key={`y${you.id}`} style={[styles.capLine, { animationName: FADE_UP, animationDuration: ms(360), animationTimingFunction: easeOut }]}>
          <Text style={[styles.capWho, { color: C.gold }]}>YOU  </Text>
          <Text style={styles.capYou}>{you.text}</Text>
        </Animated.Text>
      ) : null}
      {ryu ? (
        <Animated.Text key={`r${ryu.id}`} style={[styles.capLine, { animationName: FADE_UP, animationDuration: ms(360), animationTimingFunction: easeOut }]}>
          <Text style={[styles.capWho, { color: C.systemHi }]}>RYU  </Text>
          <Text style={[styles.capRyu, textGlow(C.systemGlow, 8)]}>{ryu.text}</Text>
        </Animated.Text>
      ) : null}
    </View>
  );
}

// ── System notifications ────────────────────────────────────────────────────

export function Notices({ compact }: { compact: boolean }) {
  const notices = useRyu((s) => s.notices);
  return (
    <View style={[styles.notices, compact && styles.noticesCompact]} pointerEvents="box-none">
      {notices.map((n) => (
        <Pressable key={n.id} onPress={() => useRyu.getState().dismiss(n.id)}>
          <SystemWindow title="Notification" tone={n.tone} compact animKey={n.id} style={{ width: compact ? "100%" : 330 }}>
            <Text style={styles.noticeTitle}>{n.title}</Text>
            <Text style={styles.noticeBody}>{n.body}</Text>
          </SystemWindow>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 13, backgroundColor: "rgba(4,12,30,0.6)", borderRadius: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontFamily: F.label, fontSize: 10.5, letterSpacing: 2.4 },
  top: { position: "absolute", top: 0, left: 0, right: 0, height: 64, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 20 },
  topCompact: { height: 54, paddingHorizontal: 16 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 160 },
  word: { fontFamily: F.displayBold, fontSize: 22, letterSpacing: 7, color: C.ice },
  tag: { borderWidth: 1, borderColor: C.line, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontFamily: F.label, fontSize: 9, letterSpacing: 2, color: C.systemHi },
  right: { flexDirection: "row", alignItems: "center", gap: 16, minWidth: 160, justifyContent: "flex-end" },
  clock: { fontFamily: F.mono, fontSize: 11.5, color: C.muted, letterSpacing: 1 },
  icon: { borderWidth: 1, borderColor: C.line, paddingHorizontal: 8, paddingVertical: 4 },
  iconText: { fontFamily: F.label, fontSize: 9.5, letterSpacing: 1.8 },
  captions: { position: "absolute", left: 16, right: 16, bottom: 118, alignItems: "center", gap: 6, zIndex: 15 },
  captionsInline: { alignItems: "center", gap: 6, marginTop: 14, minHeight: 48, paddingHorizontal: 8 },
  capLine: { maxWidth: 720, textAlign: "center" },
  capWho: { fontFamily: F.label, fontSize: 10, letterSpacing: 2.4 },
  capYou: { fontFamily: F.body, fontSize: 15, color: C.text, lineHeight: 22 },
  capRyu: { fontFamily: F.bodyMed, fontSize: 16, color: C.ice, lineHeight: 23 },
  notices: { position: "absolute", top: 72, right: 24, gap: 10, zIndex: 40, alignItems: "flex-end" },
  noticesCompact: { right: 16, left: 16, top: 60 },
  noticeTitle: { fontFamily: F.bodySemi, fontSize: 14.5, color: C.ice, marginBottom: 3 },
  noticeBody: { fontFamily: F.body, fontSize: 13, color: C.text, lineHeight: 19 },
});
