import type { LiveAtom, Meeting } from "./types";

/**
 * A fully processed sample meeting: exactly what the real pipeline emits.
 * Used by the app's demo mode (no keys needed) and by the server smoke test.
 */
export const DEMO_SCRIPT: { speaker: "S1" | "S2" | "S3"; at: number; text: string }[] = [
  { speaker: "S2", at: 4, text: "Okay, the main thing today is whether we ship the Q4 launch on the fifteenth." },
  { speaker: "S3", at: 12, text: "Honestly the onboarding flow isn't ready. I'd push a week." },
  { speaker: "S1", at: 20, text: "If we push, marketing needs to know by Friday. I'll tell them once we decide." },
  { speaker: "S2", at: 29, text: "Let's keep the fifteenth but cut the tutorial screen. Everyone okay with that?" },
  { speaker: "S3", at: 36, text: "Fine by me. I'll have the trimmed flow in staging by Wednesday." },
  { speaker: "S1", at: 44, text: "Great. Priya, can you send me the updated metrics deck?" },
  { speaker: "S2", at: 50, text: "Sure, I'll send it tomorrow morning." },
  { speaker: "S3", at: 57, text: "Open question: who's on call for launch night?" },
  { speaker: "S1", at: 64, text: "I can try to cover the first half, but we need someone for after midnight." },
];

export const DEMO_LIVE_ATOMS: { afterLine: number; atom: LiveAtom }[] = [
  { afterLine: 4, atom: { kind: "decision", id: "L1", text: "Ship on the 15th; cut the tutorial screen", at: "00:29" } },
  { afterLine: 5, atom: { kind: "commitment", id: "L2", text: "Arjun: trimmed flow in staging by Wednesday", at: "00:36" } },
  { afterLine: 7, atom: { kind: "commitment", id: "L3", text: "Priya: metrics deck tomorrow morning", at: "00:50" } },
  { afterLine: 8, atom: { kind: "question", id: "L4", text: "Who's on call for launch night?", at: "00:57" } },
];

export function demoMeeting(now = new Date()): Meeting {
  const started = new Date(now.getTime() - 70_000);
  return {
    id: `demo-${now.getTime()}`,
    title: "Q4 launch: ship on the 15th",
    startedAt: started.toISOString(),
    endedAt: now.toISOString(),
    durationSec: 70,
    participantsHint: ["Priya", "Arjun"],
    status: "ready",
    draft: [],
    engine: { stt: "demo", llm: "demo" },
    speakers: [
      { id: "S1", label: "A", name: null, isMe: true, method: "user" },
      { id: "S2", label: "B", name: "Priya", isMe: false, method: "context" },
      { id: "S3", label: "C", name: "Arjun", isMe: false, method: "context" },
    ],
    utterances: DEMO_SCRIPT.map((l, i) => ({
      id: `U${String(i + 1).padStart(3, "0")}`,
      speaker: l.speaker,
      start: l.at,
      end: l.at + 6,
      text: l.text,
    })),
    ledger: {
      topics: [
        { id: "T1", title: "Launch date", startUtt: "U001", endUtt: "U005" },
        { id: "T2", title: "Follow-ups & staffing", startUtt: "U006", endUtt: "U009" },
      ],
      atoms: [
        { kind: "decision", id: "D1", text: "Ship the Q4 launch on the 15th and cut the tutorial screen.", decidedBy: ["S2", "S3"], evidence: ["U004", "U005"], confidence: 0.93 },
        { kind: "commitment", id: "C1", task: "Trimmed onboarding flow in staging", owner: "S3", requestedBy: null, due: null, dueText: "by Wednesday", strength: "firm", evidence: ["U005"], confidence: 0.95 },
        { kind: "commitment", id: "C2", task: "Tell marketing the final date", owner: "S1", requestedBy: null, due: null, dueText: "by Friday", strength: "firm", evidence: ["U003"], confidence: 0.9 },
        { kind: "commitment", id: "C3", task: "Send the updated metrics deck", owner: "S2", requestedBy: "S1", due: null, dueText: "tomorrow morning", strength: "firm", evidence: ["U006", "U007"], confidence: 0.96 },
        { kind: "commitment", id: "C4", task: "Cover the first half of launch-night on-call", owner: "S1", requestedBy: null, due: null, dueText: null, strength: "tentative", evidence: ["U009"], confidence: 0.82 },
        { kind: "question", id: "Q1", text: "Who is on call for launch night after midnight?", askedBy: "S3", directedTo: null, answered: false, evidence: ["U008", "U009"], confidence: 0.9 },
        { kind: "position", id: "P1", speaker: "S3", topic: "launch date", stance: "Push a week; onboarding isn't ready", evidence: ["U002"], confidence: 0.9 },
        { kind: "risk", id: "R1", text: "Onboarding flow may not be ready for the 15th.", raisedBy: "S3", evidence: ["U002"], confidence: 0.85 },
      ],
    },
    note: {
      title: "Q4 launch: ship on the 15th",
      tldr: "The launch stays on the 15th with the tutorial screen cut, so the trimmed onboarding flow must land in staging by Wednesday. Launch-night on-call after midnight is still unstaffed.",
      decisions: ["D1"],
      actions: ["C1", "C2", "C3", "C4"],
      openQuestions: ["Q1"],
      risks: ["R1"],
      topics: [
        { topicId: "T1", summary: "Arjun wanted a one-week delay; the group kept the date by cutting scope instead.", atoms: ["P1", "D1", "C1"] },
        { topicId: "T2", summary: "Deck and marketing follow-ups assigned; on-call coverage only half solved.", atoms: ["C2", "C3", "C4", "Q1"] },
      ],
    },
    personNotes: [
      {
        speakerId: "S1",
        headline: "You owe marketing the final date by Friday, and Priya owes you the metrics deck.",
        yourActions: ["C2", "C4"],
        owedToYou: ["C3"],
        questionsForYou: [],
        decisionsAffectingYou: [{ atomId: "D1", why: "The date is final, so the marketing notice can go out." }],
        yourContributions: [{ summary: "Flagged the marketing deadline and offered partial on-call cover.", atoms: ["C2", "C4"] }],
        suggestedFollowUps: ["Confirm the 15th with marketing", "Find cover for after midnight"],
      },
      {
        speakerId: "S2",
        headline: "Priya's proposal to keep the date by cutting the tutorial was adopted.",
        yourActions: ["C3"],
        owedToYou: [],
        questionsForYou: [],
        decisionsAffectingYou: [{ atomId: "D1", why: "She proposed it and owns the launch plan." }],
        yourContributions: [{ summary: "Proposed keeping the 15th with reduced scope.", atoms: ["D1"] }],
        suggestedFollowUps: ["Send the metrics deck tomorrow morning"],
      },
      {
        speakerId: "S3",
        headline: "Arjun owns the trimmed onboarding flow by Wednesday and raised the on-call gap.",
        yourActions: ["C1"],
        owedToYou: [],
        questionsForYou: [],
        decisionsAffectingYou: [{ atomId: "D1", why: "His onboarding work now has a hard Wednesday deadline." }],
        yourContributions: [{ summary: "Argued for a one-week delay; accepted the reduced scope.", atoms: ["P1", "R1"] }],
        suggestedFollowUps: ["Get the trimmed flow into staging by Wednesday"],
      },
    ],
    voiceBrief:
      "Notes are ready. One decision: the launch stays on the fifteenth. You need to tell marketing by Friday, and Priya owes you the deck. Want your to-dos?",
  };
}
