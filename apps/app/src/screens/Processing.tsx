import { speakerName } from "@ryu/core";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { currentMeeting, useRyu, type StepStatus } from "../state/store";
import { C, F, textGlow } from "../theme";
import { Core } from "../ui/Core";
import { easeOut, FADE_UP, ms, PULSE } from "../ui/motion";
import { SystemWindow } from "../ui/SystemWindow";

const SHIMMER = { from: { transform: [{ translateX: "-100%" as const }] }, to: { transform: [{ translateX: "250%" as const }] } };
const GLYPH: Record<StepStatus, string> = { pending: "◇", active: "◈", done: "◆", error: "✕", skip: "◇" };

/** The real pipeline, stage by stage — nothing here is a fake loader. */
export function Processing({ compact }: { compact: boolean }) {
  const stages = useRyu((s) => s.stages);
  const m = useRyu(currentMeeting);
  const acquired = m?.personNotes ?? [];
  const done = stages.filter((s) => s.status === "done").length;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {!compact && <Core size={200} mode="thinking" />}
      <SystemWindow title="System analysis" delay={0} style={[styles.win, compact && { width: "100%" }]} right={<Text style={styles.count}>{done}/{stages.length}</Text>}>
        {stages.map((s, i) => {
          const color = s.status === "done" ? C.ok : s.status === "active" ? C.systemHi : s.status === "error" ? C.danger : C.faint;
          return (
            <View key={s.stage} style={styles.row}>
              <Animated.Text style={[styles.glyph, { color }, s.status === "active" ? { animationName: PULSE, animationDuration: ms(900), animationIterationCount: "infinite" } : null]}>{GLYPH[s.status]}</Animated.Text>
              <View style={{ flex: 1, gap: 5 }}>
                <View style={{ flexDirection: compact ? "column" : "row", justifyContent: "space-between", gap: compact ? 2 : 8 }}>
                  <Text style={[styles.label, { color: s.status === "pending" ? C.muted : C.ice }]}>{`${String(i + 1).padStart(2, "0")}  ${s.label.toUpperCase()}`}</Text>
                  {s.detail ? <Text style={styles.detail} numberOfLines={1}>{s.detail}</Text> : null}
                </View>
                <View style={styles.track}>
                  {s.status === "done" ? <View style={[styles.fillBar, { backgroundColor: C.ok, width: "100%" }]} /> : null}
                  {s.status === "active" ? (
                    <Animated.View
                      style={[
                        styles.fillBar,
                        { width: "40%", backgroundColor: C.systemHi, boxShadow: `0 0 12px ${C.system}`, animationName: SHIMMER, animationDuration: ms(1100), animationIterationCount: "infinite", animationTimingFunction: easeOut },
                      ]}
                    />
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </SystemWindow>

      <View style={[styles.acquired, compact && { width: "100%" }]}>
        {m?.note ? (
          <Animated.View style={{ animationName: FADE_UP, animationDuration: ms(420), animationTimingFunction: easeOut }}>
            <Text style={[styles.drop, textGlow(C.systemGlow, 8)]}>◆ MEETING NOTE ACQUIRED — {m.note.title}</Text>
          </Animated.View>
        ) : null}
        {acquired.map((p) => {
          const me = m?.speakers.find((s) => s.id === p.speakerId)?.isMe;
          return (
            <Animated.View key={p.speakerId} style={{ animationName: FADE_UP, animationDuration: ms(420), animationTimingFunction: easeOut }}>
              <Text style={[styles.drop, { color: me ? C.gold : C.systemHi }, textGlow(me ? C.goldGlow : C.systemGlow, 8)]}>
                ◆ PERSON NOTE ACQUIRED — {m ? speakerName(m.speakers, p.speakerId).toUpperCase() : p.speakerId}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 16 },
  wrapCompact: { justifyContent: "flex-start", paddingTop: 110 },
  win: { width: 560 },
  count: { fontFamily: F.mono, fontSize: 11, color: C.muted },
  row: { flexDirection: "row", gap: 12, paddingVertical: 9, alignItems: "flex-start" },
  glyph: { fontSize: 14, width: 16, marginTop: -1, fontFamily: F.display },
  label: { fontFamily: F.label, fontSize: 11.5, letterSpacing: 2.2 },
  detail: { fontFamily: F.mono, fontSize: 10.5, color: C.muted, flexShrink: 1 },
  track: { height: 2, backgroundColor: "rgba(77,163,255,0.12)", overflow: "hidden" },
  fillBar: { position: "absolute", top: 0, bottom: 0, left: 0 },
  acquired: { width: 560, gap: 6, minHeight: 90 },
  drop: { fontFamily: F.label, fontSize: 11.5, letterSpacing: 2, color: C.systemHi },
});
