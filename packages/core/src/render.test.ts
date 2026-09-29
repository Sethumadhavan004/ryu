import assert from "node:assert/strict";
import { test } from "node:test";
import { demoMeeting } from "./demo";
import { atomIndex, atomText, formatClock, noteForSpeech, resolveNoteTarget } from "./render";

const m = demoMeeting(new Date("2026-09-28T10:00:00Z"));

test("voice targets resolve to the right note", () => {
  assert.equal(resolveNoteTarget(m, "summary"), "meeting");
  assert.equal(resolveNoteTarget(m, "the meeting notes"), "meeting");
  assert.equal(resolveNoteTarget(m, "me"), "S1");
  assert.equal(resolveNoteTarget(m, "my notes"), "S1");
  assert.equal(resolveNoteTarget(m, "Priya"), "S2");
  assert.equal(resolveNoteTarget(m, "priya's notes"), "S2");
  assert.equal(resolveNoteTarget(m, "speaker c"), "S3");
  assert.equal(resolveNoteTarget(m, "Bob"), null);
});

test("a name containing a summary keyword opens that person, not the summary", () => {
  // Regression: /main|core/ used to match inside "Mainak" / "Romain".
  const withMainak = { ...m, speakers: m.speakers.map((s) => (s.id === "S3" ? { ...s, name: "Mainak" } : s)) };
  assert.equal(resolveNoteTarget(withMainak, "Mainak"), "S3");
  assert.equal(resolveNoteTarget(withMainak, "open mainak's notes"), "S3");
  assert.equal(resolveNoteTarget(withMainak, "the main summary"), "meeting");
});

test("atoms render with names, owners and timing", () => {
  const idx = atomIndex(m);
  assert.equal(atomText(idx.get("C3")!, m.speakers), "Priya → Send the updated metrics deck (tomorrow morning)");
  assert.equal(atomText(idx.get("C2")!, m.speakers), "You → Tell marketing the final date (by Friday)");
});

test("notes read aloud are plain speech with the asked section", () => {
  const s = noteForSpeech(m, "S1", "actions");
  assert.match(s, /To do: You → Tell marketing/);
  assert.doesNotMatch(s, /Owed by others/);
  assert.match(noteForSpeech(m, "meeting"), /Decisions: Ship the Q4 launch/);
});

test("clock formatting", () => {
  assert.equal(formatClock(65), "01:05");
  assert.equal(formatClock(3725), "1:02:05");
});
