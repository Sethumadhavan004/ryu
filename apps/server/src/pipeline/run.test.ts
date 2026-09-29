import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProcessEvent } from "@ryu/core";
import { MockLanguageModelV4 } from "ai/test";
import { meetingDay, runPipeline } from "./run";

/**
 * Drives the full pipeline with a scripted model that deliberately misbehaves,
 * to prove the code-level guarantees hold regardless of the model:
 *  - atoms citing non-existent utterances are dropped (evidence or it doesn't exist)
 *  - "unsupported" verdicts drop atoms; "fix" verdicts patch them
 *  - the meeting note can't omit an action item
 *  - person-note action lists are computed from the ledger, not the model
 */

const RAW = [
  { speaker: "A", start: 4, end: 9, text: "Okay, the main thing today is whether we ship the Q4 launch on the fifteenth." },
  { speaker: "B", start: 12, end: 16, text: "Honestly the onboarding flow isn't ready. I'd push a week." },
  { speaker: "C", start: 20, end: 26, text: "If we push, marketing needs to know by Friday. I'll tell them once we decide." },
  { speaker: "A", start: 29, end: 34, text: "Let's keep the fifteenth but cut the tutorial screen. Everyone okay with that?" },
  { speaker: "B", start: 36, end: 41, text: "Fine by me, Priya. I'll have the trimmed flow in staging by Wednesday." },
  { speaker: "C", start: 44, end: 48, text: "Great. Priya, can you send me the updated metrics deck?" },
  { speaker: "A", start: 50, end: 53, text: "Sure, I'll send it tomorrow morning." },
  { speaker: "B", start: 57, end: 60, text: "Thanks. Arjun here — who's on call for launch night?" },
];
// After S0: A→S1 (Priya), B→S2 (Arjun), C→S3 (the user). U001…U008.

const replies: Record<string, unknown> = {
  speakers: {
    speakers: [
      { id: "S1", name: "Priya", evidence: ["U005", "U006"] },
      { id: "S2", name: "Arjun", evidence: ["U008"] },
      { id: "S3", name: null, evidence: [] },
    ],
  },
  ledger: {
    decisions: [{ text: "Ship on the 15th; cut the tutorial screen.", decidedBy: ["S1", "S2"], evidence: ["U004", "U005"], confidence: 0.9 }],
    commitments: [
      { task: "Trimmed flow in staging", owner: "S2", requestedBy: null, strength: "firm", due: null, dueText: "by Wednesday", evidence: ["U005"], confidence: 0.9 },
      { task: "Tell marketing the date", owner: "S3", requestedBy: null, strength: "firm", due: null, dueText: "by Friday", evidence: ["U003"], confidence: 0.9 },
      // owner/requestedBy swapped on purpose — verification must fix it
      { task: "Send the metrics deck", owner: "S3", requestedBy: "S1", strength: "firm", due: null, dueText: "tomorrow morning", evidence: ["U006", "U007"], confidence: 0.8 },
      // hallucinated: cites an utterance that doesn't exist → must be dropped in code
      { task: "Book a launch party", owner: "S1", requestedBy: null, strength: "firm", due: null, dueText: null, evidence: ["U999"], confidence: 0.4 },
    ],
    questions: [{ text: "Who is on call for launch night?", askedBy: "S2", directedTo: null, answered: false, evidence: ["U008"], confidence: 0.9 }],
    risks: [],
    positions: [{ speaker: "S2", topic: "date", stance: "Push a week", evidence: ["U002"], confidence: 0.9 }],
    facts: [],
    topics: [{ title: "Launch date", startUtt: "U001", endUtt: "U005" }, { title: "Follow-ups", startUtt: "U006", endUtt: "U008" }],
  },
  verify: {
    verdicts: [
      { id: "D1", verdict: "supported", reason: "ok", fix: null },
      { id: "C1", verdict: "supported", reason: "ok", fix: null },
      { id: "C2", verdict: "supported", reason: "ok", fix: null },
      { id: "C3", verdict: "fix", reason: "owner and requester swapped", fix: { text: null, task: null, owner: "S1", requestedBy: "S3", strength: null, dueText: null, answered: null } },
      { id: "P1", verdict: "unsupported", reason: "overstated", fix: null },
      { id: "Q1", verdict: "supported", reason: "ok", fix: null },
    ],
    missing: { decisions: [], commitments: [], questions: [] },
  },
  // omits C2 from actions on purpose — completeness must append it
  meeting: {
    title: "Q4 launch holds the 15th",
    tldr: "Launch stays on the 15th with the tutorial cut.",
    decisions: ["D1"],
    actions: ["C1", "C3", "C404"],
    openQuestions: [],
    risks: [],
    topics: [{ topicId: "T1", summary: "Scope cut to keep the date.", atoms: ["D1", "ZZZ"] }],
  },
  person: { headline: "Headline.", decisionsAffectingYou: [{ atomId: "D1", why: "affects work" }, { atomId: "C1", why: "not a decision" }], yourContributions: [], suggestedFollowUps: ["a", "b", "c", "d"] },
  brief: { text: "Notes are ready." },
};

function route(system: string): unknown {
  if (system.includes("name the speakers")) return replies.speakers;
  if (system.includes("extract a factual ledger")) return replies.ledger;
  if (system.includes("audit a ledger")) return replies.verify;
  if (system.includes("shared meeting note")) return replies.meeting;
  if (system.includes("personal note")) return replies.person;
  if (system.includes("says aloud")) return replies.brief;
  throw new Error(`unrouted system prompt: ${system.slice(0, 60)}`);
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const model = () =>
  new MockLanguageModelV4({
    doGenerate: async (opts) => {
      const sys = opts.prompt.find((m) => m.role === "system");
      const text = JSON.stringify(route(typeof sys?.content === "string" ? sys.content : ""));
      return { content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
    },
  });

test("n+1 pipeline enforces its guarantees", async () => {
  const events: ProcessEvent[] = [];
  for await (const e of runPipeline({
    meta: { title: "Weekly", startedAt: "2026-09-28T10:00:00Z", participantsHint: ["Priya", "Arjun"] },
    brain: { main: model(), lite: model(), label: "mock" },
    transcribe: async () => ({ utterances: RAW, engine: "test" }),
  })) {
    events.push(e);
  }

  const err = events.find((e) => e.type === "error");
  assert.equal(err, undefined, JSON.stringify(err));

  // speakers: names from evidence; leftover voice = the user
  const t = [...events].reverse().find((e) => e.type === "transcript")!;
  assert.ok(t.type === "transcript");
  assert.deepEqual(t.speakers.map((s) => [s.id, s.name, s.isMe]), [["S1", "Priya", false], ["S2", "Arjun", false], ["S3", null, true]]);

  const ledger = events.find((e) => e.type === "ledger")!;
  assert.ok(ledger.type === "ledger");
  const ids = ledger.ledger.atoms.map((a) => a.id);
  assert.ok(!ids.includes("C4"), "hallucinated commitment with bad evidence must be dropped");
  assert.ok(!ids.includes("P1"), "unsupported atom must be dropped");
  const c3 = ledger.ledger.atoms.find((a) => a.id === "C3");
  assert.ok(c3?.kind === "commitment" && c3.owner === "S1" && c3.requestedBy === "S3", "fix verdict must swap owner/requester");

  const mn = events.find((e) => e.type === "meetingNote")!;
  assert.ok(mn.type === "meetingNote");
  assert.deepEqual(mn.note.actions, ["C1", "C3", "C2"], "model order kept, unknown dropped, omitted action appended");
  assert.deepEqual(mn.note.openQuestions, ["Q1"], "unanswered questions always listed");
  assert.deepEqual(mn.note.topics[0].atoms, ["D1"]);

  const pns = events.filter((e) => e.type === "personNote");
  assert.equal(pns.length, 3, "n person notes");
  const me = pns.map((e) => (e.type === "personNote" ? e.note : null)).find((n) => n?.speakerId === "S3")!;
  assert.deepEqual(me.yourActions, ["C2"], "the user's actions are computed from the ledger");
  assert.deepEqual(me.owedToYou, ["C3"], "Priya's deck is owed to the user");
  assert.deepEqual(me.decisionsAffectingYou.map((d) => d.atomId), ["D1"], "non-decision refs are filtered");
  assert.equal(me.suggestedFollowUps.length, 3);

  assert.ok(events.some((e) => e.type === "brief"));
  assert.equal(events.at(-1)?.type, "done");
});

test("relative dates resolve against the user's local day, not UTC", () => {
  // 02:00 Tuesday in India is still Monday in UTC.
  assert.deepEqual(meetingDay("2026-09-28T20:30:00Z", -330), { dateIso: "2026-09-29", weekday: "Tuesday" });
  assert.deepEqual(meetingDay("2026-09-28T20:30:00Z"), { dateIso: "2026-09-28", weekday: "Monday" });
});
