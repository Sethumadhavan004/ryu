/**
 * Data contracts shared by the app and the server.
 * See docs/research/04-experience-and-intelligence.md §B3.
 *
 * The ledger is the single source of truth: notes reference atoms by ID and
 * the UI renders the atom's own text, so the n+1 notes cannot disagree.
 */

export type SpeakerId = string; // "S1", "S2", …
export type UtteranceId = string; // "U001", …
export type AtomId = string; // "D1", "C3", "Q2", …

export interface Utterance {
  id: UtteranceId;
  speaker: SpeakerId;
  /** Seconds from meeting start. */
  start: number;
  end: number;
  text: string;
}

export type SpeakerMethod = "diarization" | "context" | "user";

export interface Speaker {
  id: SpeakerId;
  /** Diarizer label ("A", "B", …) kept for traceability. */
  label: string;
  name: string | null;
  isMe: boolean;
  method: SpeakerMethod;
}

interface AtomBase {
  id: AtomId;
  evidence: UtteranceId[];
  confidence: number;
}

export interface DecisionAtom extends AtomBase {
  kind: "decision";
  text: string;
  decidedBy: SpeakerId[];
}

export type CommitmentStrength = "firm" | "tentative" | "proposed";

export interface CommitmentAtom extends AtomBase {
  kind: "commitment";
  task: string;
  owner: SpeakerId | null;
  requestedBy: SpeakerId | null;
  due: string | null; // ISO date
  dueText: string | null;
  strength: CommitmentStrength;
}

export interface QuestionAtom extends AtomBase {
  kind: "question";
  text: string;
  askedBy: SpeakerId;
  directedTo: SpeakerId | null;
  answered: boolean;
}

export interface RiskAtom extends AtomBase {
  kind: "risk";
  text: string;
  raisedBy: SpeakerId;
}

export interface PositionAtom extends AtomBase {
  kind: "position";
  speaker: SpeakerId;
  topic: string;
  stance: string;
}

export interface FactAtom extends AtomBase {
  kind: "fact";
  text: string;
  statedBy: SpeakerId;
}

export type LedgerAtom =
  | DecisionAtom
  | CommitmentAtom
  | QuestionAtom
  | RiskAtom
  | PositionAtom
  | FactAtom;

export interface Topic {
  id: string;
  title: string;
  startUtt: UtteranceId;
  endUtt: UtteranceId;
}

export interface Ledger {
  atoms: LedgerAtom[];
  topics: Topic[];
}

export interface MeetingNote {
  title: string;
  tldr: string;
  decisions: AtomId[];
  actions: AtomId[];
  openQuestions: AtomId[];
  risks: AtomId[];
  topics: { topicId: string; summary: string; atoms: AtomId[] }[];
}

export interface PersonNote {
  speakerId: SpeakerId;
  headline: string;
  yourActions: AtomId[];
  owedToYou: AtomId[];
  questionsForYou: AtomId[];
  decisionsAffectingYou: { atomId: AtomId; why: string }[];
  yourContributions: { summary: string; atoms: AtomId[] }[];
  suggestedFollowUps: string[];
}

export type MeetingStatus =
  | "recording"
  | "processing"
  | "ready"
  | "failed";

/** Everything the device stores about one meeting. */
export interface Meeting {
  id: string;
  title: string;
  startedAt: string; // ISO
  endedAt: string | null;
  durationSec: number;
  participantsHint: string[];
  status: MeetingStatus;
  error?: string;
  /** Live draft lines (replaced by `utterances` after the final pass). */
  draft: { t: number; text: string }[];
  utterances: Utterance[];
  speakers: Speaker[];
  ledger: Ledger | null;
  note: MeetingNote | null;
  personNotes: PersonNote[];
  voiceBrief: string | null;
  /** Provider trail, so the UI can say how a note was made. */
  engine?: { stt: string; llm: string };
}

// ── Streaming protocol for POST /api/process (NDJSON, one event per line) ──

export type PipelineStage =
  | "transcribe"
  | "identify"
  | "ledger"
  | "verify"
  | "notes"
  | "brief";

export type ProcessEvent =
  | { type: "stage"; stage: PipelineStage; status: "start" | "done"; detail?: string }
  | { type: "transcript"; utterances: Utterance[]; speakers: Speaker[]; stt: string }
  | { type: "ledger"; ledger: Ledger }
  | { type: "meetingNote"; note: MeetingNote }
  | { type: "personNote"; note: PersonNote }
  | { type: "brief"; text: string }
  | { type: "done"; llm: string }
  | { type: "error"; message: string; stage?: PipelineStage };

export interface ProcessMeta {
  title: string;
  startedAt: string;
  participantsHint: string[];
  /** Voice brief is written for whoever is `isMe`, if known. */
}

// ── Live ledger (provisional, during the meeting) ──

export interface LiveAtom {
  kind: "decision" | "commitment" | "question";
  id: string;
  text: string;
  /** Rough mm:ss of where it was heard. */
  at: string;
}

// ── Voice-control RPC contract between the agent and the app ──

export const RPC = {
  getState: "ryu.getState",
  startMeeting: "ryu.startMeeting",
  openNote: "ryu.openNote",
  readNote: "ryu.readNote",
  renameSpeaker: "ryu.renameSpeaker",
  goHome: "ryu.goHome",
} as const;

export interface AppStateSummary {
  screen: string;
  latestMeeting: null | {
    title: string;
    when: string;
    people: string[];
    counts: { decisions: number; actions: number; open: number };
  };
  meetingsStored: number;
}
