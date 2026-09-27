import { atomIndex, formatClock, type Meeting, type PersonNote, speakerName } from "@ryu/core";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { goHome, openNote, processMeeting, renameSpeaker } from "../lib/controller";
import { currentMeeting, useRyu } from "../state/store";
import { C, F, textGlow, web } from "../theme";
import { Captions } from "../ui/Chrome";
import { DecodeText } from "../ui/DecodeText";
import { AtomRow, Empty, Section } from "../ui/Items";
import { easeOut, FADE_IN, FADE_UP, ms } from "../ui/motion";
import { SystemButton } from "../ui/SystemButton";
import { SystemWindow, type Tone } from "../ui/SystemWindow";

/** n+1 made visible: the meeting note at the centre, one card per person. */
export function Notes({ compact }: { compact: boolean }) {
  const m = useRyu(currentMeeting);
  const focus = useRyu((s) => s.focus);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && useRyu.getState().set({ focus: null });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!m) {
    return (
      <View style={styles.center}>
        <Empty>No meeting selected.</Empty>
        <SystemButton label="Home" onPress={goHome} />
      </View>
    );
  }

  if (m.status === "failed") {
    return (
      <View style={[styles.center, { paddingHorizontal: 16 }]}>
        <SystemWindow title="Analysis failed" tone="danger" style={{ width: compact ? "100%" : 520 }}>
          <Text style={styles.err}>{m.error}</Text>
          <Text style={styles.errHint}>The recording is safe on this device. Fix the cause (usually a missing key — run `npm run doctor`) and retry.</Text>
          {m.draft.length ? <Text style={styles.errHint}>Live draft kept: {m.draft.length} segments.</Text> : null}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <SystemButton label="Retry" onPress={() => void processMeeting(m.id)} />
            <SystemButton label="Home" onPress={goHome} />
          </View>
        </SystemWindow>
      </View>
    );
  }

  const me = m.speakers.find((s) => s.isMe);
  const persons = [...m.personNotes].sort((a, b) => Number(b.speakerId === me?.id) - Number(a.speakerId === me?.id));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]}>
        <View style={styles.head}>
          <DecodeText text={(m.note?.title ?? m.title).toUpperCase()} style={[styles.title, compact && { fontSize: 20, letterSpacing: 3 }, textGlow(C.systemGlow, 14)]} />
          <Text style={styles.meta}>
            {new Date(m.startedAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {formatClock(m.durationSec)} · {m.speakers.length} voices
            {m.engine ? ` · ${m.engine.stt} / ${m.engine.llm}` : ""}
          </Text>
          {compact ? <Captions inline /> : null}
        </View>

        <Pressable onPress={() => openNote("meeting")} style={[styles.coreCard, compact && { width: "100%" }, web({ cursor: "pointer" })]}>
          <NoteCard tone="system" tag="MEETING · CORE" delay={100} headline={m.note?.tldr ?? "—"} stats={[[m.note?.decisions.length ?? 0, "decisions"], [m.note?.actions.length ?? 0, "actions"], [m.note?.openQuestions.length ?? 0, "open"]]} />
        </Pressable>

        {!compact && <Links n={persons.length} />}

        <View style={[styles.people, compact && styles.peopleCompact]}>
          {persons.map((p, i) => {
            const isMe = p.speakerId === me?.id;
            return (
              <Pressable key={p.speakerId} onPress={() => openNote(p.speakerId)} style={[styles.personCard, compact && { width: "100%" }, web({ cursor: "pointer" })]}>
                <NoteCard
                  tone={isMe ? "gold" : "system"}
                  tag={isMe ? "YOU" : speakerName(m.speakers, p.speakerId).toUpperCase()}
                  delay={260 + i * 110}
                  headline={p.headline}
                  stats={[[p.yourActions.length, "to-do"], [p.owedToYou.length, "owed"], [p.questionsForYou.length, "asked"]]}
                />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footer}>
          <SystemButton label="Transcript" size="sm" onPress={() => openNote("transcript")} />
          <SystemButton label="Home" size="sm" onPress={goHome} hint="or say “go home”" />
        </View>
      </ScrollView>
      {focus ? <NoteDetail m={m} focus={focus} compact={compact} /> : null}
    </View>
  );
}

function NoteCard({ tone, tag, headline, stats, delay }: { tone: Tone; tag: string; headline: string; stats: [number, string][]; delay: number }) {
  return (
    <SystemWindow title={tag} tone={tone} compact delay={delay} glyph={tone === "gold" ? "★" : "!"}>
      <Text style={styles.headline} numberOfLines={4}>{headline}</Text>
      <View style={styles.stats}>
        {stats.map(([n, l]) => (
          <Text key={l} style={styles.stat}>
            <Text style={[styles.statN, { color: tone === "gold" ? C.gold : C.systemHi }]}>{n}</Text> {l.toUpperCase()}
          </Text>
        ))}
      </View>
    </SystemWindow>
  );
}

function Links({ n }: { n: number }) {
  if (Platform.OS !== "web" || n === 0) return <View style={{ height: 34 }} />;
  const xs = Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * 100);
  return (
    <Animated.View style={{ height: 34, width: "100%", maxWidth: 1100, animationName: FADE_IN, animationDuration: ms(900), animationDelay: ms(400), animationFillMode: "both" }}>
      <svg width="100%" height="34" viewBox="0 0 100 34" preserveAspectRatio="none" style={{ display: "block" } as never}>
        {xs.map((x) => (
          <line key={x} x1="50" y1="0" x2={x} y2="34" stroke="rgba(110,185,255,0.45)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </Animated.View>
  );
}

// ── Detail reader ───────────────────────────────────────────────────────────

function NoteDetail({ m, focus, compact }: { m: Meeting; focus: string; compact: boolean }) {
  const close = () => useRyu.getState().set({ focus: null });
  const person = focus !== "meeting" && focus !== "transcript" ? m.personNotes.find((p) => p.speakerId === focus) ?? null : null;
  const isMe = person ? m.speakers.find((s) => s.id === person.speakerId)?.isMe : false;
  const title = focus === "meeting" ? "Meeting note" : focus === "transcript" ? "Transcript" : isMe ? "Your notes" : `${speakerName(m.speakers, focus)} · notes`;
  return (
    <Animated.View style={[styles.overlay, compact && { paddingTop: 96, paddingHorizontal: 10 }, { animationName: FADE_IN, animationDuration: ms(260), animationFillMode: "both" }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close note" />
      <SystemWindow
        animKey={focus}
        title={title}
        tone={isMe ? "gold" : "system"}
        glyph={isMe ? "★" : "!"}
        solid
        style={[styles.detail, compact && styles.detailCompact]}
        bodyStyle={{ padding: 0 }}
        right={
          <Pressable onPress={close} style={[styles.x, web({ cursor: "pointer" })]} accessibilityLabel="Close">
            <Text style={styles.xText}>✕</Text>
          </Pressable>
        }
      >
        <ScrollView contentContainerStyle={{ padding: compact ? 14 : 22, paddingTop: 6 }}>
          {focus === "meeting" ? <MeetingBody m={m} /> : focus === "transcript" ? <TranscriptBody m={m} /> : person ? <PersonBody m={m} p={person} /> : <Empty>Note not found.</Empty>}
        </ScrollView>
      </SystemWindow>
    </Animated.View>
  );
}

function MeetingBody({ m }: { m: Meeting }) {
  const idx = atomIndex(m);
  const me = m.speakers.find((s) => s.isMe)?.id;
  const n = m.note;
  if (!n) return <Empty>Not ready.</Empty>;
  const rows = (ids: string[]) =>
    ids.map((id) => idx.get(id)).filter(Boolean).map((a) => <AtomRow key={a!.id} atom={a!} speakers={m.speakers} mine={a!.kind === "commitment" && a!.owner === me} />);
  return (
    <>
      <Text style={styles.tldr}>{n.tldr}</Text>
      <Section title="Decisions" count={n.decisions.length} delay={80}>{n.decisions.length ? rows(n.decisions) : <Empty>No decisions were made.</Empty>}</Section>
      <Section title="Action items" count={n.actions.length} delay={140}>{n.actions.length ? rows(n.actions) : <Empty>No action items.</Empty>}</Section>
      {n.openQuestions.length ? <Section title="Open questions" count={n.openQuestions.length} delay={200}>{rows(n.openQuestions)}</Section> : null}
      {n.risks.length ? <Section title="Risks" count={n.risks.length} delay={240}>{rows(n.risks)}</Section> : null}
      {n.topics.length ? (
        <Section title="Discussion" delay={280}>
          {n.topics.map((t) => (
            <View key={t.topicId} style={styles.topic}>
              <Text style={styles.topicTitle}>{m.ledger?.topics.find((x) => x.id === t.topicId)?.title ?? t.topicId}</Text>
              <Text style={styles.topicBody}>{t.summary}</Text>
              {t.atoms.length ? <Text style={styles.topicRefs}>{t.atoms.join(" · ")}</Text> : null}
            </View>
          ))}
        </Section>
      ) : null}
      <Text style={styles.footnote}>Every item is a ledger entry with evidence (U-numbers point into the transcript). The same entry renders identically in every note, so the n+1 notes can't disagree.</Text>
    </>
  );
}

function PersonBody({ m, p }: { m: Meeting; p: PersonNote }) {
  const idx = atomIndex(m);
  const s = m.speakers.find((x) => x.id === p.speakerId)!;
  const rows = (ids: string[], mine = false) => ids.map((id) => idx.get(id)).filter(Boolean).map((a) => <AtomRow key={a!.id} atom={a!} speakers={m.speakers} mine={mine && s.isMe} />);
  return (
    <>
      <Text style={[styles.tldr, s.isMe && { borderLeftColor: C.gold }]}>{p.headline}</Text>
      <Identity m={m} speakerId={p.speakerId} />
      <Section title={s.isMe ? "Your actions" : "Their actions"} count={p.yourActions.length} delay={80}>{p.yourActions.length ? rows(p.yourActions, true) : <Empty>Nothing assigned.</Empty>}</Section>
      {p.owedToYou.length ? <Section title={s.isMe ? "Owed to you" : "Owed to them"} count={p.owedToYou.length} delay={140}>{rows(p.owedToYou)}</Section> : null}
      {p.questionsForYou.length ? <Section title={s.isMe ? "Questions waiting on you" : "Questions waiting on them"} count={p.questionsForYou.length} delay={180}>{rows(p.questionsForYou)}</Section> : null}
      {p.decisionsAffectingYou.length ? (
        <Section title={s.isMe ? "Decisions that affect you" : "Decisions that affect them"} delay={220}>
          {p.decisionsAffectingYou.map((d) => {
            const a = idx.get(d.atomId);
            return a ? <AtomRow key={d.atomId} atom={a} speakers={m.speakers} extra={d.why} /> : null;
          })}
        </Section>
      ) : null}
      {p.yourContributions.length ? (
        <Section title="Contributions" delay={260}>
          {p.yourContributions.map((c, i) => (
            <Text key={i} style={styles.bullet}>◆ {c.summary}{c.atoms.length ? <Text style={styles.topicRefs}>   {c.atoms.join(" · ")}</Text> : null}</Text>
          ))}
        </Section>
      ) : null}
      {p.suggestedFollowUps.length ? (
        <Section title="Suggested follow-ups" delay={300}>
          {p.suggestedFollowUps.map((f, i) => <Text key={i} style={styles.bullet}>→ {f}</Text>)}
        </Section>
      ) : null}
    </>
  );
}

/** Speaker identity + correction (the "user" rung of the evidence ladder). */
function Identity({ m, speakerId }: { m: Meeting; speakerId: string }) {
  const s = m.speakers.find((x) => x.id === speakerId)!;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name ?? "");
  const how = { diarization: "voice separation only", context: "named from the conversation", user: "set by you" }[s.method];
  return (
    <View style={styles.identity}>
      <Text style={styles.idLine}>
        VOICE {s.label} · {s.isMe ? "YOU" : (s.name ?? "UNNAMED").toUpperCase()} · <Text style={{ color: C.muted }}>{how}</Text>
      </Text>
      {editing ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 }}>
          <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={C.faint} style={styles.input} autoFocus onSubmitEditing={() => void renameSpeaker(m.id, speakerId, name).then(() => setEditing(false))} />
          <SystemButton label="Save" size="sm" onPress={() => void renameSpeaker(m.id, speakerId, name).then(() => setEditing(false))} />
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {!s.isMe ? <SystemButton label="This is me" size="sm" tone="gold" onPress={() => void renameSpeaker(m.id, speakerId, "me")} /> : null}
          <SystemButton label="Rename" size="sm" onPress={() => setEditing(true)} hint="or say “speaker B is Arjun”" />
        </View>
      )}
    </View>
  );
}

function TranscriptBody({ m }: { m: Meeting }) {
  if (!m.utterances.length) return <Empty>No transcript.</Empty>;
  const palette = [C.systemHi, C.shadowHi, C.ok, "#FF9DC4", "#7FE3FF", "#FFB36B"];
  return (
    <>
      {m.utterances.map((u) => {
        const idx = m.speakers.findIndex((s) => s.id === u.speaker);
        const sp = m.speakers[idx];
        const color = sp?.isMe ? C.gold : palette[idx % palette.length];
        return (
          <View key={u.id} style={styles.utt}>
            <Text style={styles.uttId}>{u.id}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.uttWho, { color }]}>{speakerName(m.speakers, u.speaker).toUpperCase()} <Text style={styles.uttT}>{formatClock(u.start)}</Text></Text>
              <Text style={styles.uttText}>{u.text}</Text>
            </View>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  scroll: { alignItems: "center", paddingTop: 84, paddingBottom: 150, paddingHorizontal: 24 },
  scrollCompact: { paddingTop: 96, paddingHorizontal: 12 },
  head: { alignItems: "center", gap: 6, marginBottom: 22, maxWidth: 900 },
  title: { fontFamily: F.display, fontSize: 26, letterSpacing: 5, color: C.ice, textAlign: "center" },
  meta: { fontFamily: F.mono, fontSize: 11, color: C.muted, textAlign: "center" },
  coreCard: { width: 560 },
  people: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16, maxWidth: 1100 },
  peopleCompact: { flexDirection: "column", gap: 12, width: "100%", marginTop: 12 },
  personCard: { width: 320 },
  headline: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.ice },
  stats: { flexDirection: "row", gap: 14, marginTop: 10 },
  stat: { fontFamily: F.label, fontSize: 10, letterSpacing: 1.6, color: C.muted },
  statN: { fontFamily: F.displayBold, fontSize: 13 },
  footer: { flexDirection: "row", gap: 10, marginTop: 28 },
  overlay: { position: "absolute", inset: 0, backgroundColor: "rgba(1,4,12,0.72)", alignItems: "center", justifyContent: "center", zIndex: 30, padding: 16 },
  detail: { width: 780, maxWidth: "100%", maxHeight: "86%" },
  detailCompact: { width: "100%", maxHeight: "92%" },
  x: { paddingHorizontal: 6, paddingVertical: 2 },
  xText: { color: C.systemHi, fontSize: 14, fontFamily: F.display },
  tldr: { fontFamily: F.bodyMed, fontSize: 17, lineHeight: 26, color: C.ice, borderLeftWidth: 2, borderLeftColor: C.system, paddingLeft: 14, marginTop: 10 },
  topic: { paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "rgba(77,163,255,0.1)" },
  topicTitle: { fontFamily: F.label, fontSize: 12, letterSpacing: 1.6, color: C.ice },
  topicBody: { fontFamily: F.body, fontSize: 14, lineHeight: 21, color: C.text, marginTop: 3 },
  topicRefs: { fontFamily: F.mono, fontSize: 10.5, color: C.faint, marginTop: 3 },
  footnote: { fontFamily: F.body, fontSize: 12, lineHeight: 18, color: C.faint, marginTop: 22 },
  bullet: { fontFamily: F.body, fontSize: 14, lineHeight: 21, color: C.text, paddingVertical: 4, paddingHorizontal: 8 },
  identity: { marginTop: 14, padding: 12, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: "rgba(77,163,255,0.04)" },
  idLine: { fontFamily: F.label, fontSize: 11, letterSpacing: 1.8, color: C.ice },
  input: { flex: 1, borderWidth: 1, borderColor: C.line, color: C.ice, fontFamily: F.body, fontSize: 14, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "rgba(4,12,30,0.8)" },
  err: { fontFamily: F.bodyMed, fontSize: 15, color: C.ice, lineHeight: 22 },
  errHint: { fontFamily: F.body, fontSize: 13, color: C.text, lineHeight: 19, marginTop: 8 },
  utt: { flexDirection: "row", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(77,163,255,0.08)" },
  uttId: { fontFamily: F.mono, fontSize: 10.5, color: C.faint, width: 36, marginTop: 2 },
  uttWho: { fontFamily: F.label, fontSize: 10.5, letterSpacing: 1.8 },
  uttT: { fontFamily: F.mono, fontSize: 10, color: C.faint },
  uttText: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.text, marginTop: 2 },
});
