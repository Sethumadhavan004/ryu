import { atomMeta, atomText, type LedgerAtom, type Speaker } from "@ryu/core";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { C, F, textGlow } from "../theme";
import { easeOut, FADE_UP, ms } from "./motion";

export const KIND: Record<string, { label: string; color: string }> = {
  decision: { label: "DECISION", color: C.systemHi },
  commitment: { label: "ACTION", color: C.gold },
  question: { label: "QUESTION", color: C.shadowHi },
  risk: { label: "RISK", color: C.danger },
  position: { label: "POSITION", color: C.muted },
  fact: { label: "FACT", color: C.muted },
};

export function Section({ title, count, children, delay = 0 }: { title: string; count?: number; children: ReactNode; delay?: number }) {
  return (
    <Animated.View style={[styles.section, { animationName: FADE_UP, animationDuration: ms(420), animationDelay: ms(delay), animationFillMode: "both", animationTimingFunction: easeOut }]}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionTick} />
        <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
        {count !== undefined && <Text style={styles.sectionCount}>{count}</Text>}
        <View style={styles.sectionLine} />
      </View>
      {children}
    </Animated.View>
  );
}

/** One ledger atom, rendered from the ledger — identical wherever it appears. */
export function AtomRow({ atom, speakers, mine, extra }: { atom: LedgerAtom; speakers: Speaker[]; mine?: boolean; extra?: string }) {
  const k = KIND[atom.kind];
  return (
    <View style={[styles.row, mine && styles.rowMine]}>
      <View style={[styles.id, { borderColor: mine ? C.gold : k.color }]}>
        <Text style={[styles.idText, { color: mine ? C.gold : k.color }]}>{atom.id}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.text, mine && textGlow(C.goldGlow, 6)]}>
          {atomText(atom, speakers)}
        </Text>
        {extra ? <Text style={styles.why}>{extra}</Text> : null}
        <Text style={styles.meta}>{atomMeta(atom)}</Text>
      </View>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={styles.empty}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sectionTick: { width: 6, height: 6, backgroundColor: C.system, transform: [{ rotate: "45deg" }] },
  sectionTitle: { fontFamily: F.label, fontSize: 11, letterSpacing: 2.8, color: C.systemHi },
  sectionCount: { fontFamily: F.mono, fontSize: 11, color: C.muted },
  sectionLine: { flex: 1, height: 1, backgroundColor: C.lineSoft },
  row: { flexDirection: "row", gap: 12, paddingVertical: 9, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "rgba(77,163,255,0.1)" },
  rowMine: { backgroundColor: "rgba(255,210,122,0.06)", borderLeftWidth: 2, borderLeftColor: C.gold, paddingLeft: 10 },
  id: { borderWidth: 1, paddingHorizontal: 5, height: 20, justifyContent: "center", minWidth: 34, alignItems: "center", marginTop: 1 },
  idText: { fontFamily: F.monoMed, fontSize: 10.5 },
  text: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.ice },
  tentative: { fontFamily: F.mono, fontSize: 11.5, color: C.muted },
  why: { fontFamily: F.body, fontSize: 13, color: C.text, marginTop: 3, lineHeight: 19 },
  meta: { fontFamily: F.mono, fontSize: 10.5, color: C.faint, marginTop: 4, letterSpacing: 0.4 },
  empty: { fontFamily: F.body, fontSize: 13.5, color: C.muted, paddingVertical: 8, lineHeight: 20 },
});
