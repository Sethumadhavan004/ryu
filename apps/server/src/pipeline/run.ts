import type {
  AtomId,
  CommitmentAtom,
  Ledger,
  LedgerAtom,
  MeetingNote,
  PersonNote,
  ProcessEvent,
  ProcessMeta,
  QuestionAtom,
  Speaker,
  Utterance,
} from "@ryu/core";
import { atomText, formatClock, speakerName } from "@ryu/core";
import type { Brain } from "../llm";
import { structured } from "../llm";
import type { RawUtterance } from "../stt";
import * as P from "./prompts";
import * as S from "./schemas";

/**
 * The n+1 notes pipeline (Research 04 §B2): extract once, write many.
 *   S0 prepare → IDENTIFY speakers → S1 ledger → S2 verify → S3 meeting note
 *   → S4 person notes (parallel) → S5 voice brief
 * Streams ProcessEvents so the UI can show real stages as they happen.
 */

export interface PipelineInput {
  meta: ProcessMeta;
  brain: Brain;
  /** Produces diarized utterances (AssemblyAI / Gemini / a test double). */
  transcribe: () => Promise<{ utterances: RawUtterance[]; engine: string }>;
  signal?: AbortSignal;
}

export async function* runPipeline(input: PipelineInput): AsyncGenerator<ProcessEvent> {
  const { meta, brain } = input;
  const date = new Date(meta.startedAt);
  const dateIso = date.toISOString().slice(0, 10);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });

  // ── TRANSCRIBE + S0 PREPARE ──────────────────────────────────────────────
  yield { type: "stage", stage: "transcribe", status: "start" };
  const raw = await input.transcribe();
  const { utterances, speakers } = prepare(raw.utterances);
  if (utterances.length === 0) {
    yield { type: "error", stage: "transcribe", message: "No speech was detected in the recording." };
    return;
  }
  yield { type: "transcript", utterances, speakers, stt: raw.engine };
  yield { type: "stage", stage: "transcribe", status: "done", detail: `${utterances.length} lines · ${speakers.length} voices` };

  const transcript = formatTranscript(utterances);

  // ── IDENTIFY (context rung of the evidence ladder, Research 03 §4c) ──────
  yield { type: "stage", stage: "identify", status: "start" };
  try {
    const named = await structured({
      model: brain.main,
      schema: S.speakersOut,
      system: P.SPEAKERS_SYSTEM,
      prompt: P.speakersPrompt({ hint: meta.participantsHint, ids: speakers.map((s) => s.id), transcript }),
      temperature: 0,
      abortSignal: input.signal,
    });
    applySpeakerNames(speakers, named.speakers, utterances, meta.participantsHint);
  } catch (e) {
    console.warn("[pipeline] speaker naming failed; keeping labels", e);
  }
  yield { type: "transcript", utterances, speakers, stt: raw.engine };
  yield {
    type: "stage",
    stage: "identify",
    status: "done",
    detail: speakers.map((s) => speakerName(speakers, s.id)).join(" · "),
  };

  const roster = speakers
    .map((s) => `${s.id} → ${s.isMe ? "the user (me)" : s.name ?? "null"}`)
    .join("\n");

  // ── S1 LEDGER ────────────────────────────────────────────────────────────
  yield { type: "stage", stage: "ledger", status: "start" };
  const extracted = await structured({
    model: brain.main,
    schema: S.ledgerOut,
    system: P.LEDGER_SYSTEM,
    prompt: P.ledgerPrompt({ title: meta.title, dateIso, weekday, roster, transcript }),
    temperature: 0.1,
    abortSignal: input.signal,
  });
  let ledger = buildLedger(extracted, utterances, speakers);
  yield { type: "stage", stage: "ledger", status: "done", detail: `${ledger.atoms.length} items` };

  // ── S2 VERIFY ────────────────────────────────────────────────────────────
  yield { type: "stage", stage: "verify", status: "start" };
  try {
    const audit = await structured({
      model: brain.main,
      schema: S.verifyOut,
      system: P.VERIFY_SYSTEM,
      prompt: P.verifyPrompt({ transcript, ledger: ledgerForPrompt(ledger) }),
      temperature: 0,
      abortSignal: input.signal,
    });
    const before = ledger.atoms.length;
    ledger = applyVerification(ledger, audit, utterances, speakers);
    const dropped = audit.verdicts.filter((v) => v.verdict === "unsupported").length;
    const fixed = audit.verdicts.filter((v) => v.verdict === "fix").length;
    yield {
      type: "stage",
      stage: "verify",
      status: "done",
      detail: `${fixed} fixed · ${dropped} dropped · ${Math.max(0, ledger.atoms.length - before + dropped)} recovered`,
    };
  } catch (e) {
    console.warn("[pipeline] verification failed; using unverified ledger", e);
    yield { type: "stage", stage: "verify", status: "done", detail: "skipped (model error)" };
  }
  yield { type: "ledger", ledger };

  const ledgerText = ledgerForPrompt(ledger);
  const people = speakers.map((s) => speakerName(speakers, s.id)).join(", ");

  // ── S3 MEETING NOTE ──────────────────────────────────────────────────────
  yield { type: "stage", stage: "notes", status: "start" };
  const mn = await structured({
    model: brain.main,
    schema: S.meetingNoteOut,
    system: P.MEETING_NOTE_SYSTEM,
    prompt: P.meetingNotePrompt({ title: meta.title, dateIso, people, ledger: ledgerText, transcript }),
    temperature: 0.4,
    abortSignal: input.signal,
  });
  const note = completeMeetingNote(mn, ledger);
  yield { type: "meetingNote", note };

  // ── S4 PERSON NOTES (parallel; emitted as each finishes) ─────────────────
  const jobs = speakers.map((s) => () => personNote(s, { ...input, dateIso, ledger, ledgerText, note, speakers, utterances }));
  for await (const pn of parallel(jobs, 4)) yield { type: "personNote", note: pn };
  yield { type: "stage", stage: "notes", status: "done", detail: `1 + ${speakers.length} notes` };

  // ── S5 VOICE BRIEF ───────────────────────────────────────────────────────
  yield { type: "stage", stage: "brief", status: "start" };
  const me = speakers.find((s) => s.isMe);
  const idx = new Map(ledger.atoms.map((a) => [a.id, a]));
  const mine = me
    ? ledger.atoms
        .filter((a): a is CommitmentAtom => a.kind === "commitment" && a.owner === me.id)
        .map((a) => atomText(a, speakers))
    : [];
  let brief: string;
  try {
    const r = await structured({
      model: brain.lite,
      schema: S.briefOut,
      system: P.BRIEF_SYSTEM,
      prompt: P.briefPrompt({
        note: `${note.title}. ${note.tldr} Decisions: ${note.decisions.map((id) => atomText(idx.get(id)!, speakers)).join("; ") || "none"}.`,
        mine: mine.length ? mine.join("; ") : me ? "nothing assigned" : "unknown (user not identified)",
      }),
      temperature: 0.6,
      abortSignal: input.signal,
    });
    brief = r.text;
  } catch {
    brief = `Notes are ready: ${note.decisions.length} decisions and ${note.actions.length} action items.${mine.length ? ` ${mine.length} are yours.` : ""} Want me to read them?`;
  }
  yield { type: "brief", text: brief };
  yield { type: "stage", stage: "brief", status: "done" };
  yield { type: "done", llm: brain.label };
}

// ── S0 ───────────────────────────────────────────────────────────────────────

export function prepare(raw: RawUtterance[]): { utterances: Utterance[]; speakers: Speaker[] } {
  const labels: string[] = [];
  const merged: RawUtterance[] = [];
  for (const u of raw) {
    const text = u.text.trim();
    if (!text) continue;
    const prev = merged[merged.length - 1];
    // Merge micro-fragments from the same speaker so IDs stay meaningful.
    if (prev && prev.speaker === u.speaker && u.start - prev.end < 1.0 && prev.text.length + text.length < 360) {
      prev.text = `${prev.text} ${text}`;
      prev.end = u.end;
    } else {
      merged.push({ ...u, text });
    }
    if (!labels.includes(u.speaker)) labels.push(u.speaker);
  }
  const idOf = new Map(labels.map((l, i) => [l, `S${i + 1}`]));
  const speakers: Speaker[] = labels.map((l, i) => ({
    id: `S${i + 1}`,
    label: /^[A-Z]$/.test(l) ? l : String.fromCharCode(65 + i),
    name: null,
    isMe: false,
    method: "diarization",
  }));
  const utterances: Utterance[] = merged.map((u, i) => ({
    id: `U${String(i + 1).padStart(3, "0")}`,
    speaker: idOf.get(u.speaker)!,
    start: Math.max(0, u.start),
    end: Math.max(u.start, u.end),
    text: u.text,
  }));
  return { utterances, speakers };
}

export function formatTranscript(us: Utterance[]): string {
  return us.map((u) => `${u.id} [${formatClock(u.start)}] ${u.speaker}: ${u.text}`).join("\n");
}

function applySpeakerNames(
  speakers: Speaker[],
  named: { id: string; name: string | null; evidence: string[] }[],
  utterances: Utterance[],
  hint: string[],
) {
  const valid = new Set(utterances.map((u) => u.id));
  for (const n of named) {
    const s = speakers.find((x) => x.id === n.id);
    if (!s || !n.name) continue;
    if (!n.evidence.some((e) => valid.has(e))) continue; // evidence or it doesn't exist
    s.name = n.name.trim();
    s.method = "context";
  }
  // "Leftover is me": the user named the others when starting the meeting.
  // If every hinted participant was matched and exactly one voice is left,
  // that voice is almost certainly the user (Research 03 §4c, rung 3).
  const unnamed = speakers.filter((s) => !s.name);
  const matchedHints = hint.filter((h) =>
    speakers.some((s) => s.name && s.name.toLowerCase().includes(h.toLowerCase().split(/\s+/)[0])),
  );
  if (hint.length > 0 && matchedHints.length === hint.length && unnamed.length === 1) {
    unnamed[0].isMe = true;
    unnamed[0].method = "context";
  } else if (speakers.length === 1) {
    speakers[0].isMe = true; // a solo recording is the user's own
  }
}

// ── S1: IDs + evidence enforcement ──────────────────────────────────────────

export function buildLedger(out: S.LedgerOut, utterances: Utterance[], speakers: Speaker[]): Ledger {
  const ctx = makeCtx(utterances, speakers);
  const atoms: LedgerAtom[] = [];
  const counters: Record<string, number> = {};
  const next = (p: string) => `${p}${(counters[p] = (counters[p] ?? 0) + 1)}`;
  const push = (a: LedgerAtom | null) => a && atoms.push(a);

  for (const d of out.decisions) push(ctx.decision(d, next("D")));
  for (const c of out.commitments) push(ctx.commitment(c, next("C")));
  for (const q of out.questions) push(ctx.question(q, next("Q")));
  for (const r of out.risks) {
    const ev = ctx.ev(r.evidence);
    if (ev.length && ctx.spk(r.raisedBy))
      push({ kind: "risk", id: next("R"), text: r.text, raisedBy: r.raisedBy, evidence: ev, confidence: clamp(r.confidence) });
  }
  for (const p of out.positions) {
    const ev = ctx.ev(p.evidence);
    if (ev.length && ctx.spk(p.speaker))
      push({ kind: "position", id: next("P"), speaker: p.speaker, topic: p.topic, stance: p.stance, evidence: ev, confidence: clamp(p.confidence) });
  }
  for (const f of out.facts) {
    const ev = ctx.ev(f.evidence);
    if (ev.length && ctx.spk(f.statedBy))
      push({ kind: "fact", id: next("F"), text: f.text, statedBy: f.statedBy, evidence: ev, confidence: clamp(f.confidence) });
  }
  const topics = out.topics
    .filter((t) => ctx.validUtt.has(t.startUtt) && ctx.validUtt.has(t.endUtt))
    .map((t, i) => ({ id: `T${i + 1}`, ...t }));
  return { atoms, topics };
}

function makeCtx(utterances: Utterance[], speakers: Speaker[]) {
  const validUtt = new Set(utterances.map((u) => u.id));
  const validSpk = new Set(speakers.map((s) => s.id));
  const ev = (ids: string[]) => [...new Set(ids.filter((id) => validUtt.has(id)))].slice(0, 4);
  const spk = (id: string | null | undefined) => (id && validSpk.has(id) ? id : null);
  return {
    validUtt,
    ev,
    spk,
    decision(d: typeof S.decisionOut._output, id: string): LedgerAtom | null {
      const e = ev(d.evidence);
      if (!e.length) return null;
      return { kind: "decision", id, text: d.text, decidedBy: d.decidedBy.filter((x) => validSpk.has(x)), evidence: e, confidence: clamp(d.confidence) };
    },
    commitment(c: typeof S.commitmentOut._output, id: string): LedgerAtom | null {
      const e = ev(c.evidence);
      if (!e.length) return null;
      const owner = spk(c.owner);
      return {
        kind: "commitment",
        id,
        task: c.task,
        owner,
        requestedBy: spk(c.requestedBy),
        due: c.due && /^\d{4}-\d{2}-\d{2}$/.test(c.due) ? c.due : null,
        dueText: c.dueText,
        strength: owner ? c.strength : "proposed",
        evidence: e,
        confidence: clamp(c.confidence),
      };
    },
    question(q: typeof S.questionOut._output, id: string): LedgerAtom | null {
      const e = ev(q.evidence);
      const askedBy = spk(q.askedBy);
      if (!e.length || !askedBy) return null;
      return { kind: "question", id, text: q.text, askedBy, directedTo: spk(q.directedTo), answered: q.answered, evidence: e, confidence: clamp(q.confidence) };
    },
  };
}

const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5));

export function ledgerForPrompt(l: Ledger): string {
  return JSON.stringify({ atoms: l.atoms, topics: l.topics });
}

// ── S2: apply verdicts ──────────────────────────────────────────────────────

export function applyVerification(
  ledger: Ledger,
  audit: typeof S.verifyOut._output,
  utterances: Utterance[],
  speakers: Speaker[],
): Ledger {
  const ctx = makeCtx(utterances, speakers);
  const verdicts = new Map(audit.verdicts.map((v) => [v.id, v]));
  const atoms: LedgerAtom[] = [];
  for (const a of ledger.atoms) {
    const v = verdicts.get(a.id);
    if (v?.verdict === "unsupported") continue;
    if (v?.verdict === "fix" && v.fix) {
      const f = v.fix;
      const patched = { ...a } as LedgerAtom & Record<string, unknown>;
      if (f.text && "text" in patched) patched.text = f.text;
      if (patched.kind === "commitment") {
        if (f.task) patched.task = f.task;
        if (f.owner !== null) patched.owner = ctx.spk(f.owner);
        if (f.requestedBy !== null) patched.requestedBy = ctx.spk(f.requestedBy);
        if (f.strength) patched.strength = f.strength;
        if (f.dueText !== null) patched.dueText = f.dueText;
        if (!patched.owner) patched.strength = "proposed";
      }
      if (patched.kind === "question" && f.answered !== null) patched.answered = f.answered;
      atoms.push(patched);
      continue;
    }
    atoms.push(a);
  }
  // Recovered items get fresh IDs after the highest existing one per prefix.
  const maxOf = (p: string) =>
    Math.max(0, ...atoms.filter((a) => a.id.startsWith(p)).map((a) => Number(a.id.slice(1)) || 0));
  let d = maxOf("D"), c = maxOf("C"), q = maxOf("Q");
  for (const x of audit.missing.decisions) { const a = ctx.decision(x, `D${++d}`); if (a) atoms.push(a); }
  for (const x of audit.missing.commitments) { const a = ctx.commitment(x, `C${++c}`); if (a) atoms.push(a); }
  for (const x of audit.missing.questions) { const a = ctx.question(x, `Q${++q}`); if (a) atoms.push(a); }
  return { atoms, topics: ledger.topics };
}

// ── S3: completeness is enforced in code ────────────────────────────────────

export function completeMeetingNote(out: typeof S.meetingNoteOut._output, ledger: Ledger): MeetingNote {
  const byKind = (k: LedgerAtom["kind"]) => ledger.atoms.filter((a) => a.kind === k).map((a) => a.id);
  const known = new Set(ledger.atoms.map((a) => a.id));
  // Keep the model's ordering, drop unknown IDs, append anything it left out:
  // no decision or action item can silently disappear from the meeting note.
  const ordered = (ids: string[], all: string[]) => {
    const kept = [...new Set(ids.filter((id) => all.includes(id)))];
    return [...kept, ...all.filter((id) => !kept.includes(id))];
  };
  const commitments = ledger.atoms.filter((a): a is CommitmentAtom => a.kind === "commitment");
  const strengthRank = { firm: 0, tentative: 1, proposed: 2 } as const;
  const actionsAll = [...commitments].sort((a, b) => strengthRank[a.strength] - strengthRank[b.strength]).map((a) => a.id);
  const openAll = ledger.atoms.filter((a): a is QuestionAtom => a.kind === "question" && !a.answered).map((a) => a.id);
  return {
    title: out.title,
    tldr: out.tldr,
    decisions: ordered(out.decisions, byKind("decision")),
    actions: ordered(out.actions, actionsAll),
    openQuestions: ordered(out.openQuestions, openAll),
    risks: ordered(out.risks, byKind("risk")),
    topics: out.topics
      .filter((t) => ledger.topics.some((x) => x.id === t.topicId))
      .map((t) => ({ ...t, atoms: t.atoms.filter((id) => known.has(id)) })),
  };
}

// ── S4 ───────────────────────────────────────────────────────────────────────

/** The parts of a person note that are pure functions of the ledger. */
export function computedForPerson(ledger: Ledger, id: string) {
  const cs = ledger.atoms.filter((a): a is CommitmentAtom => a.kind === "commitment");
  const rank = { firm: 0, tentative: 1, proposed: 2 } as const;
  return {
    yourActions: cs.filter((c) => c.owner === id).sort((a, b) => rank[a.strength] - rank[b.strength]).map((c) => c.id),
    owedToYou: cs.filter((c) => c.requestedBy === id && c.owner !== id).map((c) => c.id),
    questionsForYou: ledger.atoms
      .filter((a): a is QuestionAtom => a.kind === "question" && a.directedTo === id)
      .sort((a, b) => Number(a.answered) - Number(b.answered))
      .map((a) => a.id),
  };
}

async function personNote(
  s: Speaker,
  c: PipelineInput & {
    dateIso: string;
    ledger: Ledger;
    ledgerText: string;
    note: MeetingNote;
    speakers: Speaker[];
    utterances: Utterance[];
  },
): Promise<PersonNote> {
  const computed = computedForPerson(c.ledger, s.id);
  const idx = new Map(c.ledger.atoms.map((a) => [a.id, a]));
  const show = (ids: AtomId[]) => ids.map((id) => `${id}: ${atomText(idx.get(id)!, c.speakers)}`).join("; ") || "none";
  const known = new Set(c.ledger.atoms.map((a) => a.id));
  const decisions = new Set(c.ledger.atoms.filter((a) => a.kind === "decision").map((a) => a.id));
  try {
    const out = await structured({
      model: c.brain.main,
      schema: S.personNoteOut,
      system: P.personNoteSystem(s.isMe),
      prompt: P.personNotePrompt({
        who: `${s.id} (${speakerName(c.speakers, s.id)})`,
        title: c.note.title,
        dateIso: c.dateIso,
        tldr: c.note.tldr,
        computed: `Their actions: ${show(computed.yourActions)}\nOwed to them: ${show(computed.owedToYou)}\nQuestions directed at them: ${show(computed.questionsForYou)}`,
        ledger: c.ledgerText,
        theirLines: formatTranscript(c.utterances.filter((u) => u.speaker === s.id)) || "(did not speak)",
      }),
      temperature: 0.4,
      abortSignal: c.signal,
    });
    return {
      speakerId: s.id,
      headline: out.headline,
      ...computed,
      decisionsAffectingYou: out.decisionsAffectingYou.filter((d) => decisions.has(d.atomId)),
      yourContributions: out.yourContributions.map((x) => ({ ...x, atoms: x.atoms.filter((id) => known.has(id)) })),
      suggestedFollowUps: out.suggestedFollowUps.slice(0, 3),
    };
  } catch (e) {
    console.warn(`[pipeline] person note for ${s.id} failed; using computed fallback`, e);
    const n = computed.yourActions.length;
    return {
      speakerId: s.id,
      headline: n ? `${speakerName(c.speakers, s.id)} owns ${n} action item${n > 1 ? "s" : ""}.` : `${speakerName(c.speakers, s.id)} has no assigned actions.`,
      ...computed,
      decisionsAffectingYou: [],
      yourContributions: [],
      suggestedFollowUps: [],
    };
  }
}

/** Run jobs with a concurrency cap; yield results in completion order. */
async function* parallel<T>(jobs: (() => Promise<T>)[], limit: number): AsyncGenerator<T> {
  const running = new Map<number, Promise<{ i: number; v: T }>>();
  let next = 0;
  const start = () => {
    const i = next++;
    running.set(i, jobs[i]().then((v) => ({ i, v })));
  };
  while (next < jobs.length && running.size < limit) start();
  while (running.size) {
    const { i, v } = await Promise.race(running.values());
    running.delete(i);
    if (next < jobs.length) start();
    yield v;
  }
}
