import type { LiveAtom, Meeting, PipelineStage, SpeakerId } from "@ryu/core";
import { create } from "zustand";

export type Phase = "boot" | "home" | "meeting" | "processing" | "notes";
export type VoiceStatus =
  | "off" // not started
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "dormant" // idle-sleep; tap to wake
  | "muted"
  | "unavailable" // not configured on the server
  | "error";

export type StepStatus = "pending" | "active" | "done" | "error" | "skip";
export interface BootStep { key: string; label: string; status: StepStatus; detail?: string }
export interface StageRow { stage: PipelineStage; label: string; status: StepStatus; detail?: string }
export interface Caption { id: string; who: "you" | "ryu"; text: string; final: boolean }
export interface Notice { id: number; title: string; body: string; tone: "system" | "shadow" | "gold" | "danger" }

export interface Providers { brain: string | null; liveStt: string | null; finalStt: string | null; voice: string | null }

export interface LiveSession {
  title: string;
  participants: string[];
  startedAt: number;
  draft: { t: number; text: string }[];
  atoms: LiveAtom[];
  tabAudio: boolean;
  draftEngine: string | null;
}

export const STAGES: StageRow[] = [
  { stage: "transcribe", label: "Transcribe · diarize", status: "pending" },
  { stage: "identify", label: "Identify speakers", status: "pending" },
  { stage: "ledger", label: "Extract ledger", status: "pending" },
  { stage: "verify", label: "Verify evidence", status: "pending" },
  { stage: "notes", label: "Write n+1 notes", status: "pending" },
  { stage: "brief", label: "Voice brief", status: "pending" },
];

interface State {
  phase: Phase;
  demo: boolean;
  serverUp: boolean | null;
  providers: Providers | null;
  boot: BootStep[];
  voice: VoiceStatus;
  voiceError: string | null;
  captions: Caption[];
  meetings: Meeting[];
  currentId: string | null;
  live: LiveSession | null;
  stages: StageRow[];
  focus: null | "meeting" | SpeakerId;
  notices: Notice[];
  soundOn: boolean;
}

interface Actions {
  set: (p: Partial<State>) => void;
  setBoot: (key: string, status: StepStatus, detail?: string) => void;
  setStage: (stage: PipelineStage, status: StepStatus, detail?: string) => void;
  caption: (c: Caption) => void;
  upsertMeeting: (m: Meeting) => void;
  patchMeeting: (id: string, fn: (m: Meeting) => Meeting) => void;
  notify: (n: Omit<Notice, "id">) => void;
  dismiss: (id: number) => void;
}

let noticeId = 1;

export const useRyu = create<State & Actions>()((set, get) => ({
  phase: "boot",
  demo: false,
  serverUp: null,
  providers: null,
  boot: [
    { key: "store", label: "Local vault", status: "pending" },
    { key: "server", label: "Ryu server", status: "pending" },
    { key: "brain", label: "Intelligence core", status: "pending" },
    { key: "voice", label: "Voice link", status: "pending" },
    { key: "mic", label: "Microphone", status: "pending" },
  ],
  voice: "off",
  voiceError: null,
  captions: [],
  meetings: [],
  currentId: null,
  live: null,
  stages: STAGES,
  focus: null,
  notices: [],
  soundOn: true,

  set: (p) => set(p),
  setBoot: (key, status, detail) =>
    set({ boot: get().boot.map((b) => (b.key === key ? { ...b, status, detail } : b)) }),
  setStage: (stage, status, detail) =>
    set({ stages: get().stages.map((s) => (s.stage === stage ? { ...s, status, detail: detail ?? s.detail } : s)) }),
  caption: (c) => {
    const rest = get().captions.filter((x) => x.id !== c.id && x.who !== c.who);
    set({ captions: [...rest, c].slice(-2) });
  },
  upsertMeeting: (m) => {
    const others = get().meetings.filter((x) => x.id !== m.id);
    set({ meetings: [m, ...others].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) });
  },
  patchMeeting: (id, fn) => {
    const m = get().meetings.find((x) => x.id === id);
    if (m) get().upsertMeeting(fn(m));
  },
  notify: (n) => {
    const id = noticeId++;
    set({ notices: [...get().notices.slice(-2), { ...n, id }] });
    setTimeout(() => get().dismiss(id), 5200);
  },
  dismiss: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
}));

export const currentMeeting = (s: State): Meeting | null =>
  s.meetings.find((m) => m.id === s.currentId) ?? null;
