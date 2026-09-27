import type {
  AtomId,
  LedgerAtom,
  Meeting,
  PersonNote,
  Speaker,
  SpeakerId,
} from "./types";

export function speakerName(speakers: Speaker[], id: SpeakerId | null | undefined): string {
  if (!id) return "Unassigned";
  const s = speakers.find((x) => x.id === id);
  if (!s) return id;
  if (s.isMe) return "You";
  return s.name ?? `Speaker ${s.label}`;
}

export function atomIndex(m: Meeting): Map<AtomId, LedgerAtom> {
  return new Map((m.ledger?.atoms ?? []).map((a) => [a.id, a]));
}

/** One-line canonical text for an atom. Every note renders atoms through this. */
export function atomText(a: LedgerAtom, speakers: Speaker[]): string {
  const n = (id: SpeakerId | null) => speakerName(speakers, id);
  switch (a.kind) {
    case "decision":
      return a.text;
    case "commitment": {
      const due = a.dueText ? ` (${a.dueText})` : "";
      const who = a.owner ? n(a.owner) : "Unassigned";
      return `${who} → ${a.task}${due}`;
    }
    case "question":
      return a.directedTo ? `${a.text} (to ${n(a.directedTo)})` : a.text;
    case "risk":
      return a.text;
    case "position":
      return `${n(a.speaker)} on ${a.topic}: ${a.stance}`;
    case "fact":
      return a.text;
  }
}

export function atomMeta(a: LedgerAtom): string {
  const ev = a.evidence.length ? a.evidence.join(" · ") : "";
  if (a.kind === "commitment") return `${ev}${ev ? " · " : ""}${a.strength}`;
  if (a.kind === "question") return `${ev}${ev ? " · " : ""}${a.answered ? "answered" : "open"}`;
  return ev;
}

export function personTitle(m: Meeting, p: PersonNote): string {
  const s = m.speakers.find((x) => x.id === p.speakerId);
  if (s?.isMe) return "Your notes";
  return `${speakerName(m.speakers, p.speakerId)}'s notes`;
}

/** Resolve a spoken target ("summary", "me", "priya", "speaker two") to a note key. */
export function resolveNoteTarget(m: Meeting, target: string): "meeting" | SpeakerId | null {
  const t = target.trim().toLowerCase();
  if (!t || /summary|meeting|overall|core|main/.test(t)) return "meeting";
  if (/^(me|my|mine|myself|you|your)\b/.test(t) || t === "my notes") {
    const me = m.speakers.find((s) => s.isMe);
    return me ? me.id : null;
  }
  const numWords: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6" };
  const spk = t.match(/speaker\s+(\w+)/);
  if (spk) {
    const k = numWords[spk[1]] ?? spk[1];
    const byLabel = m.speakers.find(
      (s) => s.label.toLowerCase() === k.toLowerCase() || s.id.toLowerCase() === `s${k}`,
    );
    if (byLabel) return byLabel.id;
  }
  const byName = m.speakers.find((s) => s.name && t.includes(s.name.toLowerCase()));
  if (byName) return byName.id;
  const byFirst = m.speakers.find(
    (s) => s.name && s.name.toLowerCase().split(/\s+/)[0] === t.split(/\s+/)[0],
  );
  return byFirst ? byFirst.id : null;
}

function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join("; ")}; and ${items[items.length - 1]}`;
}

/** Plain text of a note, written for being read aloud by the voice agent. */
export function noteForSpeech(m: Meeting, key: "meeting" | SpeakerId, section?: string): string {
  const idx = atomIndex(m);
  const txt = (ids: AtomId[]) =>
    ids.map((id) => idx.get(id)).filter(Boolean).map((a) => atomText(a!, m.speakers));
  const want = (s: string) => !section || section.toLowerCase().includes(s);

  if (key === "meeting") {
    const n = m.note;
    if (!n) return "The notes for that meeting aren't ready.";
    const parts = [`${n.title}. ${n.tldr}`];
    if (want("decision") && n.decisions.length) parts.push(`Decisions: ${list(txt(n.decisions))}.`);
    if ((want("action") || want("todo") || want("to-do") || want("task")) && n.actions.length)
      parts.push(`Action items: ${list(txt(n.actions))}.`);
    if (want("question") && n.openQuestions.length) parts.push(`Open questions: ${list(txt(n.openQuestions))}.`);
    return parts.join(" ");
  }
  const p = m.personNotes.find((x) => x.speakerId === key);
  if (!p) return "I don't have notes for that person.";
  const parts = [p.headline];
  if (want("action") || want("todo") || want("to-do") || want("task"))
    parts.push(p.yourActions.length ? `To do: ${list(txt(p.yourActions))}.` : "Nothing assigned.");
  if (want("owed") && p.owedToYou.length) parts.push(`Owed by others: ${list(txt(p.owedToYou))}.`);
  if (want("question") && p.questionsForYou.length) parts.push(`Questions waiting: ${list(txt(p.questionsForYou))}.`);
  return parts.join(" ");
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
