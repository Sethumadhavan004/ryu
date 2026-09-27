import { DEMO_LIVE_ATOMS, DEMO_SCRIPT, demoMeeting, type ProcessEvent } from "@ryu/core";
import { levels } from "../state/levels";
import { STAGES, useRyu } from "../state/store";
import { sound } from "./sound";
import { vault } from "./vault";

/**
 * Demo mode: drives the real UI (same store, same screens) with a scripted
 * meeting. Voice and audio levels are simulated; nothing leaves the device.
 * Web: open with ?demo. Also offered on the boot screen when the server is down.
 */
const S = () => useRyu.getState();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let running = false;

function simulateLevel(kind: "input" | "output", on: boolean) {
  levels.readers[kind] = on
    ? () => {
        const t = performance.now() / 1000;
        const syll = Math.abs(Math.sin(t * 7.1)) * Math.abs(Math.sin(t * 3.3 + 0.7));
        const phrase = Math.sin(t * 0.8) > -0.35 ? 1 : 0.08; // pauses between phrases
        return Math.min(1, (0.25 + syll * 0.75) * phrase * 0.9 + Math.random() * 0.06);
      }
    : null;
  if (!on) levels[kind] = 0;
}

async function say(who: "you" | "ryu", text: string, ms = 1400) {
  const id = `${who}-${Date.now()}`;
  if (who === "ryu") {
    S().set({ voice: "speaking" });
    simulateLevel("output", true);
  } else simulateLevel("input", true);
  const words = text.split(" ");
  for (let i = 1; i <= words.length; i++) {
    S().caption({ id, who, text: words.slice(0, i).join(" "), final: i === words.length });
    await wait(Math.min(90, ms / words.length));
  }
  await wait(ms * 0.4);
  simulateLevel(who === "ryu" ? "output" : "input", false);
  if (who === "ryu") S().set({ voice: "listening" });
}

export async function demoBoot() {
  const s = S();
  s.set({ demo: true });
  const steps: [string, string][] = [
    ["store", "demo vault"],
    ["server", "simulated"],
    ["brain", "scripted pipeline"],
    ["voice", "simulated voice"],
    ["mic", "not used in demo"],
  ];
  await vault.init().catch(() => {});
  s.set({ meetings: await vault.list().catch(() => []) });
  for (const [k, d] of steps) {
    s.setBoot(k, "active");
    await wait(260);
    s.setBoot(k, "done", d);
  }
  s.set({ providers: { brain: "demo", liveStt: "demo", finalStt: "demo", voice: "demo" }, serverUp: true });
}

export async function demoEnter() {
  sound.unlock();
  sound.play("open");
  S().set({ phase: "home", voice: "listening" });
  await wait(900);
  await say("ryu", "System online.", 900);
}

/** The scripted flow: voice command → meeting → processing → n+1 notes. */
export async function demoRun() {
  if (running) return;
  running = true;
  try {
    await say("you", "Hey Ryu, start the meeting with Priya and Arjun about the Q4 launch.", 2200);
    S().set({ voice: "thinking" });
    await wait(500);
    await say("ryu", "Recording. I'll stay quiet.", 1100);
    await demoMeeting_();
  } finally {
    running = false;
  }
}

export async function demoStartFromButton() {
  if (running) return;
  running = true;
  try {
    await demoMeeting_();
  } finally {
    running = false;
  }
}

let stopRequested = false;
export function demoStop() {
  stopRequested = true;
}

async function demoMeeting_() {
  const s = S();
  stopRequested = false;
  sound.play("rec");
  s.set({
    phase: "meeting",
    voice: "off",
    captions: [],
    live: { title: "Q4 launch", participants: ["Priya", "Arjun"], startedAt: Date.now(), draft: [], atoms: [], tabAudio: false, draftEngine: "demo" },
  });
  s.notify({ title: "Meeting mode", body: "Recording with Priya, Arjun. Ryu is not listening.", tone: "shadow" });
  simulateLevel("input", true);
  const speed = 0.42; // compress the 70 s script into ~30 s
  const t0 = Date.now();
  for (let i = 0; i < DEMO_SCRIPT.length && !stopRequested; i++) {
    const line = DEMO_SCRIPT[i];
    const due = line.at * 1000 * speed + 1200;
    while (Date.now() - t0 < due && !stopRequested) await wait(100);
    if (stopRequested) break;
    const live = S().live!;
    // Like the real live draft: text only — speakers are resolved in the final pass.
    S().set({ live: { ...live, draft: [...live.draft, { t: line.at, text: line.text }] } });
    for (const a of DEMO_LIVE_ATOMS.filter((x) => x.afterLine === i + 1)) {
      await wait(700);
      const l = S().live!;
      S().set({ live: { ...l, atoms: [...l.atoms, a.atom] } });
      sound.play("open");
    }
  }
  // Wait for the user's STOP (or auto-stop shortly after the script ends).
  const endBy = Date.now() + 6000;
  while (!stopRequested && Date.now() < endBy) await wait(100);
  simulateLevel("input", false);
  sound.play("stop");
  await demoProcess();
}

async function demoProcess() {
  const s = S();
  const final = demoMeeting();
  const shell = { ...final, status: "processing" as const, note: null, personNotes: [], ledger: null, utterances: [], speakers: [], voiceBrief: null, draft: s.live?.draft ?? [] };
  s.upsertMeeting(shell);
  s.set({ phase: "processing", currentId: final.id, live: null, stages: STAGES.map((x) => ({ ...x })) });

  const events: [number, ProcessEvent][] = [
    [300, { type: "stage", stage: "transcribe", status: "start" }],
    [1300, { type: "transcript", utterances: final.utterances, speakers: final.speakers.map((x) => ({ ...x, name: null, isMe: false, method: "diarization" })), stt: "demo" }],
    [100, { type: "stage", stage: "transcribe", status: "done", detail: `${final.utterances.length} lines · 3 voices` }],
    [200, { type: "stage", stage: "identify", status: "start" }],
    [900, { type: "transcript", utterances: final.utterances, speakers: final.speakers, stt: "demo" }],
    [100, { type: "stage", stage: "identify", status: "done", detail: "You · Priya · Arjun" }],
    [200, { type: "stage", stage: "ledger", status: "start" }],
    [1200, { type: "stage", stage: "ledger", status: "done", detail: `${final.ledger!.atoms.length + 1} items` }],
    [200, { type: "stage", stage: "verify", status: "start" }],
    [1000, { type: "ledger", ledger: final.ledger! }],
    [100, { type: "stage", stage: "verify", status: "done", detail: "1 fixed · 1 dropped · 0 recovered" }],
    [200, { type: "stage", stage: "notes", status: "start" }],
    [900, { type: "meetingNote", note: final.note! }],
    ...final.personNotes.map((n, i) => [550 + i * 150, { type: "personNote", note: n }] as [number, ProcessEvent]),
    [100, { type: "stage", stage: "notes", status: "done", detail: "1 + 3 notes" }],
    [200, { type: "stage", stage: "brief", status: "start" }],
    [500, { type: "brief", text: final.voiceBrief! }],
    [100, { type: "stage", stage: "brief", status: "done" }],
  ];
  for (const [ms, e] of events) {
    await wait(ms);
    const st = S();
    switch (e.type) {
      case "stage":
        st.setStage(e.stage, e.status === "start" ? "active" : "done", e.detail);
        break;
      case "transcript":
        st.patchMeeting(final.id, (m) => ({ ...m, utterances: e.utterances, speakers: e.speakers }));
        break;
      case "ledger":
        st.patchMeeting(final.id, (m) => ({ ...m, ledger: e.ledger }));
        break;
      case "meetingNote":
        st.patchMeeting(final.id, (m) => ({ ...m, note: e.note, title: e.note.title }));
        break;
      case "personNote":
        st.patchMeeting(final.id, (m) => ({ ...m, personNotes: [...m.personNotes, e.note] }));
        sound.play("open");
        break;
      case "brief":
        st.patchMeeting(final.id, (m) => ({ ...m, voiceBrief: e.text }));
        break;
    }
  }
  const ready = { ...final, draft: shell.draft };
  s.upsertMeeting(ready);
  await vault.save(ready).catch(() => {});
  sound.play("done");
  s.notify({ title: "Notes acquired", body: "1 + 3 notes · 4 action items", tone: "gold" });
  await wait(900);
  s.set({ phase: "notes", voice: "listening" });
  await wait(700);
  await say("ryu", final.voiceBrief!, 3000);
}
