import {
  type AppStateSummary,
  type Meeting,
  noteForSpeech,
  type ProcessEvent,
  resolveNoteTarget,
  RPC,
  speakerName,
} from "@ryu/core";
import { Platform } from "react-native";
import { IDLE_SLEEP_MS, LIVE_CHUNK_SEC, LIVE_LEDGER_EVERY_MS, SERVER_URL } from "../config";
import { STAGES, currentMeeting, useRyu } from "../state/store";
import { api } from "./api";
import { createCapture } from "./capture";
import type { Capture } from "./capture.types";
import { sound } from "./sound";
import { vault } from "./vault";
import { type RpcHandlers, voice } from "./voice";

const S = () => useRyu.getState();
const newId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

let capture: Capture | null = null;
/** Settles once the recorder has started (or failed). Stop waits on it. */
let captureStarting: Promise<void> | null = null;
let chunkQueue: Promise<void> = Promise.resolve();
let lastLedgerAt = 0;
let ledgerBusy = false;
let idleTimer: ReturnType<typeof setInterval> | null = null;
let processAbort: AbortController | null = null;
let draftErrNotified = false;
const PROCESS_TIMEOUT_MS = 10 * 60_000;

// ── Boot ────────────────────────────────────────────────────────────────────

export async function boot() {
  const s = S();
  s.setBoot("store", "active");
  try {
    const { persistent } = await vault.init();
    const meetings = await vault.list();
    // A meeting interrupted mid-processing keeps its audio: mark it retryable.
    for (const m of meetings) {
      if (m.status === "processing" || m.status === "recording") {
        m.error = m.status === "recording" ? "Recording was interrupted." : "Processing was interrupted — retry below.";
        m.status = "failed";
        await vault.save(m);
      }
    }
    // Newest first, like upsertMeeting. IndexedDB returns key order (oldest
    // first), which made "latest meeting" voice commands read an old meeting.
    s.set({ meetings: meetings.sort((a, b) => b.startedAt.localeCompare(a.startedAt)) });
    s.setBoot("store", "done", `${meetings.length} records · ${persistent ? "persistent" : "best-effort storage"}`);
  } catch (e) {
    s.setBoot("store", "error", errMsg(e));
  }

  s.setBoot("server", "active");
  try {
    const h = await api.health();
    s.set({ serverUp: true, providers: h.providers });
    s.setBoot("server", "done", "linked");
    s.setBoot("brain", h.providers.brain ? "done" : "error", h.providers.brain ?? "GOOGLE_API_KEY missing");
    s.setBoot("voice", h.providers.voice ? "done" : "skip", h.providers.voice ?? "LiveKit not configured — touch controls only");
  } catch {
    s.set({ serverUp: false, providers: null });
    s.setBoot("server", "error", `unreachable at ${SERVER_URL} — run \`npm run dev\`, then Retry`);
    s.setBoot("brain", "skip");
    s.setBoot("voice", "skip");
  }
  s.setBoot("mic", "pending", "granted on first use");
}

/** Called once the user passes the boot gate (a gesture — unlocks audio on web). */
export async function enter() {
  sound.unlock();
  sound.play("open");
  S().set({ phase: "home" });
  startIdleWatch();
  if (S().providers?.voice) await connectVoice("boot");
  else S().set({ voice: "unavailable" });
}

// ── Voice ───────────────────────────────────────────────────────────────────

export async function connectVoice(mode: "boot" | "brief" | "wake", brief?: string) {
  try {
    await voice.connect(mode, rpcHandlers, brief);
    S().setBoot("mic", "done");
  } catch (e) {
    console.warn("[voice]", e);
    S().set({ voice: "error", voiceError: errMsg(e) });
    S().notify({ title: "Voice link failed", body: errMsg(e), tone: "danger" });
  }
}

export async function wake() {
  const v = S().voice;
  if (v === "dormant" || v === "off" || v === "error") await connectVoice("wake");
}

export async function toggleMute() {
  const v = S().voice;
  if (v === "muted") await voice.setMuted(false);
  else if (voice.connected) await voice.setMuted(true);
}

function startIdleWatch() {
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    const { voice: v, phase } = S();
    const idle = (v === "listening" || v === "muted") && (phase === "home" || phase === "notes");
    if (idle && voice.connected && voice.idleFor() > IDLE_SLEEP_MS) {
      void voice.disconnect().then(() => S().set({ voice: "dormant", captions: [] }));
    }
  }, 10_000);
}

// ── Meeting lifecycle ───────────────────────────────────────────────────────

export async function startMeeting(title = "Meeting", participants: string[] = []): Promise<string> {
  const s = S();
  if (s.phase === "meeting") return "A meeting is already recording.";
  if (s.phase === "processing") return "Still analysing the last meeting.";
  draftErrNotified = false;
  s.set({
    phase: "meeting",
    focus: null,
    live: { title, participants, startedAt: Date.now(), draft: [], atoms: [], tabAudio: false, draftEngine: null },
  });
  sound.play("rec");
  guardUnload(true);
  s.notify({ title: "Meeting mode", body: participants.length ? `Recording with ${participants.join(", ")}.` : "Recording. Ryu is not listening.", tone: "shadow" });

  // Let Ryu finish its confirmation, then really close the voice session:
  // "not listening" must be literally true (Research 04 §A5).
  captureStarting = (async () => {
    if (voice.connected) await voice.waitUntilQuiet();
    // Unconditional: also cancels a connect still in flight.
    await voice.disconnect();
    S().set({ voice: "off", captions: [] });
    try {
      capture = createCapture();
      lastLedgerAt = Date.now();
      await capture.start({ chunkSec: LIVE_CHUNK_SEC, onChunk: onLiveChunk });
      S().setBoot("mic", "done");
    } catch (e) {
      capture = null;
      guardUnload(false);
      sound.play("error");
      S().notify({ title: "Microphone unavailable", body: errMsg(e), tone: "danger" });
      S().set({ phase: "home", live: null });
      if (S().providers?.voice) void connectVoice("wake");
    }
  })();
  return `Recording started${participants.length ? ` with ${participants.join(", ")}` : ""}.`;
}

export async function addTabAudio() {
  if (!capture?.canTabAudio) return;
  const ok = await capture.addTabAudio();
  const live = S().live;
  if (ok && live) S().set({ live: { ...live, tabAudio: true } });
  S().notify(ok ? { title: "Tab audio linked", body: "Online meeting audio is now captured.", tone: "system" } : { title: "No tab audio", body: "Share a tab and tick “Share tab audio”.", tone: "danger" });
}

function onLiveChunk(wav: Uint8Array, startSec: number) {
  chunkQueue = chunkQueue.then(async () => {
    try {
      const r = await api.sttChunk(wav, "audio/wav");
      const live = S().live;
      if (!live || !r.text) return;
      S().set({ live: { ...live, draft: [...live.draft, { t: startSec, text: r.text }], draftEngine: r.engine } });
      if (Date.now() - lastLedgerAt > LIVE_LEDGER_EVERY_MS) void refreshLiveLedger();
    } catch (e) {
      console.warn("[live draft]", e);
      // Otherwise a bad STT key looks exactly like a silent room.
      if (!draftErrNotified) {
        draftErrNotified = true;
        S().notify({ title: "Live draft unavailable", body: `${errMsg(e)} — the recording continues.`, tone: "danger" });
      }
    }
  });
}

async function refreshLiveLedger() {
  if (ledgerBusy) return;
  const live = S().live;
  if (!live) return;
  ledgerBusy = true;
  lastLedgerAt = Date.now();
  try {
    const window = live.draft.slice(-10).map((d) => `[${fmt(d.t)}] ${d.text}`).join("\n");
    const r = await api.liveLedger(window, live.atoms, live.participants);
    const cur = S().live;
    if (!cur) return;
    const add = r.atoms.map((a, i) => ({ ...a, id: `L${cur.atoms.length + i + 1}` }));
    if (add.length) S().set({ live: { ...cur, atoms: [...cur.atoms, ...add] } });
  } catch (e) {
    console.warn("[live ledger]", e);
  } finally {
    ledgerBusy = false;
  }
}

export async function stopMeeting() {
  const s = S();
  // Stop can be pressed while Ryu is still finishing its confirmation, before
  // the recorder exists. Wait for it instead of silently ignoring the tap.
  if (s.live && !capture && captureStarting) await captureStarting;
  const live = S().live;
  if (!live || !capture) return;
  sound.play("stop");
  const c = capture;
  capture = null;
  guardUnload(false);
  let result;
  try {
    result = await c.stop();
  } catch (e) {
    s.notify({ title: "Recording failed", body: errMsg(e), tone: "danger" });
    s.set({ phase: "home", live: null });
    return;
  }
  const m: Meeting = {
    id: newId(),
    title: live.title,
    startedAt: new Date(live.startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    durationSec: result.durationSec,
    participantsHint: live.participants,
    status: "processing",
    draft: live.draft,
    utterances: [],
    speakers: [],
    ledger: null,
    note: null,
    personNotes: [],
    voiceBrief: null,
  };
  s.upsertMeeting(m);
  s.set({ currentId: m.id, live: null });
  try {
    await vault.save(m);
    await vault.saveAudio(m.id, result.audio);
  } catch (e) {
    // Still process from memory: a full disk must not also cost the notes.
    s.notify({ title: "Couldn't save the recording", body: `${errMsg(e)} — notes will still be made, but retry won't be possible.`, tone: "danger" });
  }
  await processMeeting(m.id, result.body, result.type);
}

/** Runs the n+1 pipeline for a stored meeting (also used for retry). */
export async function processMeeting(id: string, body?: Blob | Uint8Array, type?: string) {
  const s = S();
  let m = s.meetings.find((x) => x.id === id);
  if (!m) return;
  if (!body) {
    const a = await vault.getAudio(id);
    if (!a) {
      s.notify({ title: "No audio", body: "This meeting's recording isn't on this device.", tone: "danger" });
      return;
    }
    type = a.type;
    if (a.blob) body = a.blob;
    else if (a.uri) {
      const { File } = await import("expo-file-system");
      body = await new File(a.uri).bytes();
    }
  }
  if (!body || !type) return;

  m = { ...m, status: "processing", error: undefined, ledger: null, note: null, personNotes: [], utterances: [], speakers: [] };
  s.upsertMeeting(m);
  s.set({ phase: "processing", currentId: id, stages: STAGES.map((x) => ({ ...x })), focus: null });
  processAbort = new AbortController();
  // A stalled stream would otherwise leave a spinner forever.
  const ac = processAbort;
  const watchdog = setTimeout(() => ac.abort(new Error("Analysis timed out after 10 minutes.")), PROCESS_TIMEOUT_MS);

  let failed: string | null = null;
  try {
    for await (const e of api.process(body, type, { title: m.title, startedAt: m.startedAt, participantsHint: m.participantsHint, tzOffsetMin: new Date(m.startedAt).getTimezoneOffset() }, processAbort.signal)) {
      applyEvent(id, e);
      if (e.type === "error") failed = e.message;
    }
  } catch (e) {
    failed = ac.signal.aborted ? errMsg(ac.signal.reason ?? "Analysis cancelled.") : errMsg(e);
  }
  clearTimeout(watchdog);
  processAbort = null;

  const final = S().meetings.find((x) => x.id === id)!;
  if (failed || !final.note) {
    const done: Meeting = { ...final, status: "failed", error: failed ?? "The pipeline ended without a note." };
    S().upsertMeeting(done);
    await saveQuietly(done);
    sound.play("error");
    S().notify({ title: "Analysis failed", body: done.error!, tone: "danger" });
    S().set({ phase: "notes" });
    return;
  }
  const ready: Meeting = { ...final, status: "ready" };
  S().upsertMeeting(ready);
  await saveQuietly(ready);
  sound.play("done");
  S().notify({ title: "Notes acquired", body: `1 + ${ready.personNotes.length} notes · ${ready.note!.actions.length} action items`, tone: "gold" });
  await new Promise((r) => setTimeout(r, 900));
  S().set({ phase: "notes" });
  if (S().providers?.voice) void connectVoice("brief", ready.voiceBrief ?? undefined);
}

function applyEvent(id: string, e: ProcessEvent) {
  const s = S();
  switch (e.type) {
    case "stage":
      s.setStage(e.stage, e.status === "start" ? "active" : "done", e.detail);
      break;
    case "transcript":
      s.patchMeeting(id, (m) => ({ ...m, utterances: e.utterances, speakers: e.speakers, engine: { stt: e.stt, llm: m.engine?.llm ?? "" } }));
      break;
    case "ledger":
      s.patchMeeting(id, (m) => ({ ...m, ledger: e.ledger }));
      break;
    case "meetingNote":
      s.patchMeeting(id, (m) => ({ ...m, note: e.note, title: e.note.title }));
      break;
    case "personNote":
      s.patchMeeting(id, (m) => ({ ...m, personNotes: [...m.personNotes.filter((p) => p.speakerId !== e.note.speakerId), e.note] }));
      sound.play("open");
      break;
    case "brief":
      s.patchMeeting(id, (m) => ({ ...m, voiceBrief: e.text }));
      break;
    case "done":
      s.patchMeeting(id, (m) => ({ ...m, engine: { stt: m.engine?.stt ?? "", llm: e.llm } }));
      break;
    case "error":
      if (e.stage) s.setStage(e.stage, "error", e.message);
      break;
  }
}

/** A vault failure after processing must not strand the UI on the Processing screen. */
async function saveQuietly(m: Meeting) {
  try {
    await vault.save(m);
  } catch (e) {
    S().notify({ title: "Couldn't save notes", body: `${errMsg(e)} — they're shown now but won't survive a reload.`, tone: "danger" });
  }
}

export function cancelProcessing() {
  processAbort?.abort();
}

// ── Notes: open / rename ────────────────────────────────────────────────────

export function openMeeting(id: string) {
  S().set({ currentId: id, phase: "notes", focus: null });
}

export function openNote(target: "meeting" | string | null) {
  S().set({ focus: target, phase: "notes" });
  sound.play("open");
}

export function goHome() {
  S().set({ phase: S().phase === "meeting" || S().phase === "processing" ? S().phase : "home", focus: null });
}

export async function renameSpeaker(meetingId: string, speakerRef: string, name: string): Promise<string> {
  const m = S().meetings.find((x) => x.id === meetingId);
  if (!m) return "No meeting found.";
  const id = resolveSpeaker(m, speakerRef);
  if (!id) return `I couldn't find ${speakerRef}. Speakers are ${m.speakers.map((s) => speakerName(m.speakers, s.id)).join(", ")}.`;
  const isMe = /^(me|myself|i|mine|you)$/i.test(name.trim());
  const updated: Meeting = {
    ...m,
    speakers: m.speakers.map((s) =>
      s.id === id
        ? { ...s, name: isMe ? s.name : name.trim(), isMe, method: "user" }
        : isMe
          ? { ...s, isMe: false }
          : s,
    ),
  };
  S().upsertMeeting(updated);
  await vault.save(updated);
  return isMe ? "Got it — that speaker is you." : `Renamed to ${name.trim()}.`;
}

function resolveSpeaker(m: Meeting, ref: string): string | null {
  const r = ref.trim().toLowerCase();
  const ordinals: Record<string, number> = { first: 1, one: 1, second: 2, two: 2, third: 3, three: 3, fourth: 4, four: 4, fifth: 5, five: 5 };
  for (const [w, n] of Object.entries(ordinals)) if (r.includes(w)) return m.speakers[n - 1]?.id ?? null;
  const num = r.match(/\d+/);
  if (num) return m.speakers[Number(num[0]) - 1]?.id ?? null;
  const letter = r.match(/\b([a-h])\b/);
  if (letter) return m.speakers.find((s) => s.label.toLowerCase() === letter[1])?.id ?? null;
  return m.speakers.find((s) => s.id.toLowerCase() === r || (s.name && r.includes(s.name.toLowerCase())))?.id ?? null;
}

// ── RPC surface for the voice agent (Research 03 §5) ────────────────────────

function latestReady(): Meeting | null {
  const s = S();
  const cur = currentMeeting(s);
  if (cur?.status === "ready") return cur;
  return s.meetings.find((m) => m.status === "ready") ?? null;
}

export function appState(): AppStateSummary {
  const s = S();
  const m = latestReady();
  return {
    screen: s.focus ? `note:${s.focus}` : s.phase,
    meetingsStored: s.meetings.length,
    latestMeeting: m && {
      title: m.title,
      when: new Date(m.startedAt).toLocaleString(),
      people: m.speakers.map((x) => speakerName(m.speakers, x.id)),
      counts: { decisions: m.note?.decisions.length ?? 0, actions: m.note?.actions.length ?? 0, open: m.note?.openQuestions.length ?? 0 },
    },
  };
}

export const rpcHandlers: RpcHandlers = {
  [RPC.getState]: async () => JSON.stringify(appState()),
  [RPC.startMeeting]: async (p) =>
    startMeeting(String(p.title || "Meeting"), Array.isArray(p.participants) ? (p.participants as unknown[]).map(String).filter(Boolean) : []),
  [RPC.openNote]: async (p) => {
    const m = latestReady();
    if (!m) return "There are no finished notes yet.";
    const key = resolveNoteTarget(m, String(p.target ?? "summary"));
    if (!key) return `No note for "${p.target}". Available: summary, ${m.speakers.map((x) => speakerName(m.speakers, x.id)).join(", ")}.`;
    S().set({ currentId: m.id });
    openNote(key);
    return `Opened ${key === "meeting" ? "the meeting summary" : `${speakerName(m.speakers, key)}'s notes`}.`;
  },
  [RPC.readNote]: async (p) => {
    const m = latestReady();
    if (!m) return "There are no finished notes yet.";
    const key = resolveNoteTarget(m, String(p.target ?? "summary"));
    if (!key) return `No note for "${p.target}".`;
    S().set({ currentId: m.id });
    openNote(key);
    return noteForSpeech(m, key, String(p.section ?? "")).slice(0, 12_000);
  },
  [RPC.renameSpeaker]: async (p) => {
    const m = latestReady() ?? currentMeeting(S());
    if (!m) return "There is no meeting to update.";
    return renameSpeaker(m.id, String(p.speaker ?? ""), String(p.name ?? ""));
  },
  [RPC.goHome]: async () => {
    goHome();
    return "Done.";
  },
};

// ── helpers ─────────────────────────────────────────────────────────────────

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
export const isWebPlatform = Platform.OS === "web";

/**
 * Web keeps the recording in memory until Stop, so closing or reloading the
 * tab mid-meeting would lose it. Ask the browser to confirm first.
 */
const onBeforeUnload = (e: Event) => e.preventDefault();
function guardUnload(on: boolean) {
  if (!isWebPlatform || typeof window === "undefined") return;
  if (on) window.addEventListener("beforeunload", onBeforeUnload);
  else window.removeEventListener("beforeunload", onBeforeUnload);
}
