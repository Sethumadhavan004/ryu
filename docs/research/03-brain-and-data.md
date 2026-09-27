# Research 03 — Brain, Data & Speakers

> Status: exploration complete, decision proposed · Date: 2026-09-27
> Builds on: [01 — Voice stack](./01-voice-stack.md) · [02 — Models & components](./02-models-and-components.md)
> Scope: where data lives, how a meeting moves from audio → note, how speakers
> are separated and identified, the V1 voice actions, and file ingestion (future).

## 0. Decisions carried in

| Decision (from you) | What it implies |
|---|---|
| **Notes live on the user's device** | The server holds **no** user data. It processes and forgets |
| Cross-meeting search = future, leave room | Schema + IDs designed for it now; no embeddings in V1 |
| V1 voice actions = **start / stop meeting mode** | Two different mechanisms (§5), because no voice session runs during a meeting |
| **Value = intelligence (insights, notes)** | Quality of transcript → speakers → summary is the product; invest there |
| Future: process uploaded recordings (audio/video) | The capture pipeline must be source-agnostic from day 1 |
| Proper speaker assignment + identify the user's voice | §4: industry practice and Ryu's layered strategy |

---

## 1. The principle: stateless intelligence, stateful device

```
      DEVICE (owns everything)                     RYU SERVER (owns nothing)
 ┌────────────────────────────────┐          ┌──────────────────────────────────┐
 │ SQLite: meetings, transcripts, │  audio → │ /stt/chunk   live draft text      │
 │   speakers, notes, people      │          │ /process     final STT + diarize  │
 │ Files: audio (opus)            │  ← JSON  │              + speaker matching   │
 │ Voiceprint (user's own)        │          │ /summarise   transcript → Note    │
 │ Job queue (offline-first)      │          │ LiveKit agent (Converse mode)     │
 └────────────────────────────────┘          └───────────┬──────────────────────┘
                                                         │ calls with user's BYOK keys
                                                         ▼
                                   Groq · AssemblyAI · Gemini · (Deepgram, OpenAI…)
```

**Why this shape works:**

- **Privacy is structural, not a policy.** The server can't leak data it never keeps.
  Audio arrives, gets processed, and the temp file is deleted when the request ends.
- **BYOK self-hosting becomes trivial.** The server has no database, migrations or backups.
  It's a pure function: `audio + keys → text/JSON`.
- **It scales for free.** Stateless servers can be restarted, replicated or run on a laptop.
- **The cost moves to the client:** the device has to handle retries, offline state and storage
  limits. §3 (job queue) and §2c (web storage) cover that.

> The one place the server needs user data is **Converse mode**, e.g. "what were
> the action items?". The agent **asks the device** over LiveKit RPC (§5), gets the
> note for that session only, and discards it afterwards.

---

## 2. On-device storage

### 2a. Engine

| Platform | DB | Audio files | Why |
|---|---|---|---|
| **Expo (iOS/Android)** | `expo-sqlite` (+ **Drizzle ORM**) | `expo-file-system` document dir | First-party, stable, Drizzle has an official Expo driver + migrations + Drizzle Studio dev plugin |
| **Web** | SQLite-WASM persisted in **OPFS** (`expo-sqlite` web build, or `@sqlite.org/sqlite-wasm`) | OPFS files | Same SQL + same Drizzle schema on both platforms |
| *Later: vector search* | swap to **`op-sqlite`** (ships `sqlite-vec` built in) | — | Drizzle supports op-sqlite too, so it's a driver swap, not a rewrite |

**Why SQLite and not a key-value store or IndexedDB:** meetings, segments, speakers and
action items are *relational* ("all open action items owned by me across meetings").
SQLite also has **FTS5 full-text search built in**. That gives us basic cross-meeting keyword
search at nearly zero cost, which is the "leeway" you asked for.

**Audio goes in files, not DB blobs.** A 1-hour meeting at 32 kbps Opus is about 14 MB. Keeping
blobs in SQLite bloats the DB and slows every query and backup.

### 2b. Schema (V1, designed for future sync + search)

```
meetings        id, title, started_at, ended_at, source(live|upload), status, lang
audio_assets    id, meeting_id, path, codec, channels(1|2), duration_s, bytes
segments        id, meeting_id, speaker_id, t_start, t_end, text, pass(live|final), channel
speakers        id, meeting_id, label("A"), person_id?, confidence, method(channel|voiceprint|context|user)
people          id, display_name, is_me, voiceprint BLOB?, voiceprint_model, enrolled_at
notes           id, meeting_id, version, body_json, model, created_at
action_items    id, meeting_id, note_id, text, owner_person_id?, due?, status, quote_ts
jobs            id, meeting_id, kind, state, attempts, last_error, next_run_at
segments_fts    FTS5(text)  ← keyword search now
-- later: segment_embeddings(segment_id, vec)  ← semantic search
```

Choices that keep the future cheap:

- **IDs are UUIDv7.** They sort by time and never collide, so a future sync engine can merge
  rows from two devices without renumbering.
- **Every table has `updated_at` and a soft-delete `deleted_at`.** Sync engines need both.
- **`notes` are versioned, not overwritten.** "Regenerate summary" or a better model later
  never destroys the old note.
- **`speakers.method` records *how* we know who someone is.** The UI can show confidence
  ("You · voice match 0.82") and the user's corrections always win.
- **`action_items` are also stored as a separate table, not only inside the JSON.** That makes
  "what do I owe people?" a query, not an LLM call.

### 2c. The web caveat: browser storage is not guaranteed

Browser storage is *best-effort* by default and can be evicted under disk pressure. **Safari deletes
all script-written storage for a site after 7 days without a visit**; home-screen
web apps are exempt. For a notes app that's a data-loss bug waiting to happen. Mitigations:

1. Call `navigator.storage.persist()` on first run and show whether it was granted.
2. Encourage **installing the web app as a PWA**; installed apps are exempt from the 7-day rule.
3. **Export** from day one: a Markdown + JSON bundle per meeting (Obsidian-friendly).
   That's the user's backup and makes "your data is yours" literally true.
4. Present mobile as the primary home for notes, and web as the capture and review surface.

### 2d. Sync (explicitly *not* V1)

When multi-device arrives, the options are PowerSync, ElectricSQL, TinyBase,
LiveStore, Jazz and similar. This space churns: Triplit's team was acqui-hired by Supabase
(Aug 2025), and Electric announced it is joining Databricks (Aug 2026). The schema above is
sync-ready either way. Because notes are private, the sync should be **end-to-end encrypted**
so it doesn't break the "server owns nothing" principle. That's a V2 research item.

### 2e. An architecture consequence to consider

With the data layer living in the client, **code sharing between web and mobile now
matters much more** than it did in Research 01. Two options, which you said you'd think through:

- **Keep Next.js for web + Expo for mobile**, sharing a `packages/core` (Drizzle schema,
  types, pipeline client, job queue). Two UIs, one brain-client.
- **Expo for all three (iOS, Android, web via Expo Router)**: one UI codebase, same
  `expo-sqlite` everywhere. Web tab-audio capture still works; it's just browser APIs.

Either way, `packages/core` should exist.

---

## 3. Meeting lifecycle (the pipeline, as a state machine)

The device drives a resumable job per meeting. Each step is idempotent, so a crash, a dead
network or a killed app can resume where it stopped.

```
 RECORDING ──stop──► FINALISING_AUDIO ──► UPLOADING ──► TRANSCRIBING ──► IDENTIFYING ──► SUMMARISING ──► READY
     │                                        ▲    (final pass,          (voiceprint +      (Gemini →
     │ every 30 s: chunk → /stt/chunk         │     diarized)             context naming)    structured Note)
     └─► live draft segments (pass=live)      └── retry w/ backoff on failure ──► FAILED (user can retry)
```

- **Live draft segments are replaced by final ones**, not merged. The final pass is
  the source of truth; the draft only exists so you see text during the meeting.
- **Uploads are resumable in chunks**, so a 14 MB file on flaky mobile data still gets through.
- **The server endpoints are pure functions.** `/process` takes audio (+ optional user
  voiceprint + optional participant names) and returns segments + speaker mapping + scores.

### Future: uploaded recordings use the same pipeline

A file upload **joins the same state machine at UPLOADING**. The only new part is an
**ingest/normalise step** in front of it:

| Input | Normalise step | Where |
|---|---|---|
| Audio file (m4a, mp3, wav…) | Pass through (providers accept most formats) | — |
| Video / screen recording (mp4, webm, mov) | **Demux the audio track without re-encoding** | Web: **Mediabunny** (WebCodecs-based; copies audio without transcoding when codecs allow). Server fallback: `ffmpeg -vn -c:a copy` |
| Noisy / music-heavy audio | *Optional* enhancement: DeepFilterNet (noise), Demucs (speech vs music) | Server, **off by default**, only when a detector flags music/noise |

So "separate the audio ourselves" is two different jobs:

- **Pulling the audio track out of a video** is easy, lossless and fast. Do it in V-next.
- **Separating speech from music or noise** is ML source separation. Modern STT models are
  already robust to noise, and enhancement can *hurt* accuracy by adding artifacts, so the
  standard practice is to apply it selectively, only when a detector says it's needed.

---

## 4. Speakers: industry practice and Ryu's strategy

### 4a. Three different problems (often confused)

| Problem | Question it answers | Output | How it's done |
|---|---|---|---|
| **Diarization** | *Who spoke when?* | Anonymous labels: A, B, C | Voice activity detection → segmentation → speaker **embeddings** → **clustering**. Modern systems are neural, with "powerset" overlap handling + VBx clustering (pyannote, DiariZen) |
| **Identification** (recognition) | *Is speaker A a voice I know?* | A = **you** | **Voiceprint**: a fixed-size vector (embedding) from a model like ECAPA-TDNN / WeSpeaker / 3D-Speaker, compared with **cosine similarity** against enrolled voiceprints |
| **Naming** (attribution) | *What's B's name?* | B = "Priya" | **Context**: an LLM reads the transcript ("thanks, Priya…"), plus a known participant list and user confirmation |

Diarization quality is measured with **DER** (Diarization Error Rate = missed speech +
false alarms + speaker confusion) and, for meeting transcripts, **cpWER** (word
errors *after* matching speakers, so it captures "who said what" at the word level).

Where diarization still struggles: **overlapping speech**, **short backchannels**
("mm-hm", "exactly"), **similar-sounding voices**, **far-field phone mics**, and an
**unknown number of speakers**. AssemblyAI's Universal-3.5 Pro (Jul 2026) attributes
speakers per word, which specifically targets short turns and overlap. That's part of
why it's the default final pass (Research 02).

### 4b. What real products do

| Product / system | Technique | Lesson for Ryu |
|---|---|---|
| **Granola** | Labels transcript **"Me" vs "Them"** from **mic vs system audio**; per-person names only via meeting-platform integrations | Separate audio channels give *certain* "is this the user?" answers for free |
| **pyannoteAI** | Voiceprint from ≤ 30 s clean audio → `/voiceprint`; `/identify` matches diarized speakers to voiceprints | Enroll once, match per meeting. That's the standard |
| **AssemblyAI Speaker Identification** | LLM maps diarized labels to names you supply (`known_values`) using conversational context; per-file only | Names come from context + a participant list, not from voice |
| Fireflies / Otter / Meet bots | Read the meeting platform's active-speaker events / participant list | Needs a bot or integration, which is out of scope for V1 |

### 4c. Ryu's speaker strategy: an evidence ladder

Each rung is used only when the one above can't decide. Every assignment records *which rung*
decided it (`speakers.method`) and a confidence score.

```
 1. CHANNEL      (web, online meeting)  mic track = You, tab track = others      certainty ≈ 1.0
 2. VOICEPRINT   (any single-mic audio) cosine(speaker centroid, your print) > τ  score 0–1
 3. CONTEXT      (all)                  LLM names others from transcript +
                                        participant list, with quoted evidence     score + quote
 4. USER         (all)                  tap a label → rename; applies everywhere   final authority
```

**Rung 1 — record in stereo.** On web, record **mic on the left channel and tab audio on the right**
instead of mixing them into mono (Research 02 said "mixed"; this corrects it). Then:

- The mic channel is you. We only diarize the tab channel to separate the remote people.
- Most STT providers support multichannel transcription. Check the exact flag per provider in the prototype.
- Caveat: without headphones, remote voices leak into your mic. Browser echo cancellation
  (`echoCancellation: true`) removes most of it, and rung 2 cleans up the rest.

**Rung 2: your voiceprint (the "identify the user" feature).** Best practice from the
speaker-verification literature, applied:

| Practice | Why | Ryu's implementation |
|---|---|---|
| **Multiple enrollment clips** | Error rates drop sharply with more clips (reported EER 0.78% → 0.2% going from 1 to 5 clips) | Onboarding: read 3–5 short prompts (~10 s each) |
| **Enough, clean speech** | Short audio gives unreliable embeddings; errors rise significantly below ~3 s | Enrollment in a quiet room; at match time **skip segments < ~1.5 s** and pool up to ~60 s per speaker |
| **Match on centroids, not single segments** | Averaging L2-normalised embeddings smooths out noise | Per diarized speaker: embed its longest segments → average → one centroid |
| **Calibrate the threshold** | No universal τ; it depends on the model, mic and room | Ship a default. Calibrate from the user's own clips vs a bundled set of other voices. Always allow "unknown" |
| **Assignment constraint** | You can only be *one* speaker in a meeting | Take the best match **above τ and with a margin over the second-best**. If two clusters both match, suggest "merge?" (the diarizer probably split you) |
| **Adapt carefully** | Voices vary (mic, cold, room) | Optionally add confirmed-you segments to the voiceprint over time. **User-confirmed only**, so errors don't compound |
| **Same model everywhere** | Embeddings from different models aren't comparable | Store `voiceprint_model` next to the vector; re-enroll if the model changes |

**Where the voiceprint math runs (V1 decision):**

- **sherpa-onnx** (open source; WeSpeaker / 3D-Speaker / NeMo embedding models) runs on
  servers (Node bindings), iOS/Android and more. It's the same toolkit we'd use for on-device speech work later.
- **V1: compute on the server, store nothing there.**
  - Enrollment: device uploads clips → server returns the vector → device stores it.
  - At `/process`: device sends the vector with the audio → server matches → returns scores → forgets both.
  - One implementation serves web and mobile.
- **V2: move embedding to the device** (react-native-sherpa-onnx / WASM), so the voiceprint
  never leaves the device at all.

**Rung 3: names for everyone else, from context.**

- The participant list comes from what you say or type when starting ("meeting with Priya and Arjun")
  and from past meetings' `people`.
- The LLM assigns names **only with quoted evidence** (a timestamp + the line that justifies it).
  Otherwise the label stays "Speaker B".
- AssemblyAI's Speaker Identification (`known_values`) can do this step when that key is set.
  Gemini does it in the summarisation call otherwise.

**Rung 4: correction.** Tap "Speaker B" → "Priya". It applies to the whole meeting and
the note re-renders. No re-transcription needed, because notes reference `speaker_id`, not names.

### 4d. Legal and ethical line (important for an open-source app)

Voiceprints are **biometric data**:

- GDPR Art. 9 requires explicit consent.
- Illinois BIPA requires *written* consent, with $1k–5k per violation and 100+ class actions in 2025.
  Texas, Washington and Colorado have similar laws.

So:

- **V1 stores exactly one voiceprint: the user's own, with explicit opt-in during onboarding,
  on their device.** Deleting it is one tap.
- **No voiceprints of other people in V1.** Names for others come from context and corrections,
  which are not biometric. Recurring-person voiceprints (like pyannote's "recurring meetings" pattern)
  are a V2 feature that needs a consent flow.
- **Recording consent:** some jurisdictions require all parties to consent to recording. Show
  a clear recording indicator, and offer a one-tap "Ryu is taking notes" announcement.
  Put a note in the README; the self-hoster is the operator.

---

## 5. V1 voice actions: start and stop meeting mode

The catch: **when a meeting is recording, no LiveKit voice session is running** (to save minutes;
see Research 02). So "start" and "stop" need two different mechanisms:

### Start: via Converse mode (tool call → client RPC)

```
You: "Ryu, start a meeting with Priya and Arjun about the Q4 launch"
 └► Gemini Live function call: start_meeting({ title, participants })
     └► Agent → LiveKit RPC → client method "ryu.startCapture"   (RPC payload ≤ 15 KiB)
         └► Client starts the local recorder + job; replies { meetingId }
 └► Ryu: "Recording. I'll stay quiet."  → agent ends the LiveKit session
```

- **LiveKit RPC** is the standard way for an agent's tool to act on the frontend:
  the client registers `registerRpcMethod`, and the agent calls `performRpc`.
- The **participants spoken here feed rung 3** of speaker naming.
- Also available: a big **Start button**, plus home-screen widget / shortcut later.

### Stop: on-device keyword spotting (plus a button, always)

| Option | Latency | Verdict |
|---|---|---|
| Button / lock-screen / notification control | Instant | ✅ Always present |
| **On-device keyword spotting ("Ryu, stop meeting")** via **sherpa-onnx KWS** | ~real-time | ✅ V1 stretch. Open-vocabulary (the phrase is a config string, no training needed), ~13 MB English model, runs offline on the audio we're already capturing |
| Spot the phrase in the live draft transcript | ~30 s (chunk lag) | ❌ Too slow |
| Picovoice Porcupine | Instant | ❌ Closed source + licence; wrong fit for an OSS project |

Guarding against false stops (someone else in the meeting saying "stop"):

- Listen only on **your mic channel** (rung 1) when it exists.
- Optionally require the phrase's audio to **match your voiceprint** (rung 2).
- Confirm with a chime + 3-second "tap to cancel". Stopping costs nothing: recording is
  saved and can resume.

---

## 6. The brain's job, precisely (what makes the notes good)

Since insights are the product, here's what the summarisation step has to do, in order:

1. **Input:** the final transcript with speaker names (or labels) + timestamps + participant
   list + meeting title.
2. **One structured call** (Research 02's `Note` schema) with **evidence**: every decision
   and action item carries `quote_ts`. If the model can't quote it, it doesn't go in.
3. **Owner resolution:** "I'll send the deck" said by *You* → an action item owned by
   `is_me`. This only works because speakers were resolved first, which is why
   IDENTIFYING runs before SUMMARISING.
4. **Store the note versioned**, and store action items as rows.
5. **Later (not V1):** note templates per meeting type (stand-up, 1:1, lecture, interview),
   and cross-meeting follow-ups ("Arjun still hasn't sent the deck since last Tuesday").

---

## 7. V1 scope summary

| Area | In V1 | Later |
|---|---|---|
| Storage | expo-sqlite + Drizzle (mobile), SQLite-WASM/OPFS (web), audio in files, export MD/JSON | E2EE multi-device sync |
| Search | FTS5 keyword search (practically free) | Embeddings + sqlite-vec semantic search |
| Pipeline | Resumable job state machine; live draft → final pass → identify → summarise | File upload ingest (demux via Mediabunny / ffmpeg), selective enhancement |
| Speakers | Stereo channel split (web), **your voiceprint** (opt-in, server-transient compute), context naming with evidence, tap-to-rename | On-device embeddings; consented voiceprints for recurring people |
| Voice actions | Start via Converse → RPC; Stop via button (+ KWS stretch) | Wake word to open Converse; more tools |

## 8. Open questions (for your architecture pass)

1. **Web UI:** Next.js + shared `packages/core`, or Expo Router for web too (§2e)?
2. **Monorepo layout:** `apps/mobile`, `apps/web`, `apps/server` (API + agent), `packages/core`?
3. **Onboarding:** is voice enrollment part of first-run, or offered after the first meeting
   ("was this you?"), which gives better clips and less friction?

---

## Sources

*As in 01/02: figures are as reported by these sources in Sept 2026. Several vendor
pages could not be opened directly from the research environment, so verify in the prototype.*

- Diarization state of the art: [Picovoice: state of diarization 2026](https://picovoice.ai/blog/state-of-speaker-diarization/) · [DiariZen tutorial (arXiv 2604.21507)](https://arxiv.org/abs/2604.21507) · [AssemblyAI diarization roundup](https://www.assemblyai.com/blog/top-speaker-diarization-libraries-and-apis) · [On the limitations of speaker diarization](https://onlinelibrary.wiley.com/doi/10.1111/exsy.70221)
- Identification & voiceprints: [pyannoteAI: diarization vs recognition vs identification](https://www.pyannote.ai/blog/speaker-diarization-vs-recognition-vs-identification) · [pyannoteAI voiceprint tutorial](https://docs.pyannote.ai/tutorials/identification-with-voiceprints) · [pyannoteAI recurring-meetings tutorial](https://www.pyannote.ai/blog/speaker-identification-system-recurring-meetings) · [pyannoteAI models](https://www.pyannote.ai/md/models)
- Context naming: [AssemblyAI Speaker Identification docs](https://www.assemblyai.com/docs/speech-understanding/speaker-identification) · [AssemblyAI: context & speaker labeling](https://www.assemblyai.com/blog/ai-transcription-with-speaker-identification) · [Cross-file speaker ID FAQ](https://www.assemblyai.com/docs/faq/do-you-offer-cross-file-speaker-identification)
- Channel attribution: [Granola speaker tags](https://docs.granola.ai/help-center/taking-notes/speaker-attribution) · [Granola "Me/Them" explained](https://luci.memories.ai/blog/fix-granola-no-speaker-labels)
- Speaker verification practice: [ECAPA-TDNN paper](https://arxiv.org/pdf/2005.07143) · [Multiple-enrollment E2E verification](https://www.sciencedirect.com/science/article/pii/S0885230824000020) · [Short-utterance compensation](https://arxiv.org/pdf/1810.10884) · [Duration in score fusion](https://arxiv.org/pdf/1608.02272)
- sherpa-onnx: [Speaker identification](https://k2-fsa.github.io/sherpa/onnx/speaker-identification/index.html) · [Speaker diarization](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/index.html) · [Repo](https://github.com/k2-fsa/sherpa-onnx)
- Biometric law: [ABA: voiceprints & BIPA](https://www.americanbar.org/groups/litigation/resources/newsletters/class-actions-derivative-suits/voiceprints-ai-bipa-new-trends-biometric-privacy-litigation/) · [Voice biometric laws by state 2026](https://summitnotes.app/blog/voice-biometric-data-laws-by-state/) · [GDPR & voice recordings](https://summitnotes.app/blog/gdpr-voice-recordings-biometric-data/) · [Biometric compliance 2026](https://toslawyer.com/biometric-data-privacy-compliance-tech-companies-2026/)
- Storage: [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/) · [Drizzle + Expo SQLite](https://orm.drizzle.team/docs/sqlite/connect-expo-sqlite) · [Drizzle + op-sqlite](https://orm.drizzle.team/docs/sqlite/connect-op-sqlite) · [sqlite-vec on mobile](https://alexgarcia.xyz/sqlite-vec/android-ios.html) · [MDN storage quotas & eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) · [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- Sync landscape: [Choosing a sync engine in 2026](https://johnny.sh/blog/choosing-a-sync-engine-in-2026/) · [Electric vs PowerSync vs LiveStore](https://kanopylabs.com/blog/electric-sql-vs-powersync-vs-livestore-local-first) · [PGlite vs Electric vs Triplit](https://www.pkgpulse.com/guides/pglite-vs-electric-sql-vs-triplit-local-first-databases-2026)
- Voice actions: [LiveKit RPC](https://docs.livekit.io/transport/data/rpc/) · [Wake word guide 2026](https://picovoice.ai/blog/complete-guide-to-wake-word/) · [openWakeWord](https://github.com/dscripka/openWakeWord) · [RN wake word 2026](https://picovoice.ai/blog/react-native-wake-word/)
- Ingest & enhancement: [Mediabunny](https://mediabunny.dev/) · [web-demuxer](https://github.com/bilibili/web-demuxer) · [MDN WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) · [DeepFilterNet](https://github.com/topics/deepfilternet) · [Selective Demucs for music removal (Sommelier)](https://arxiv.org/pdf/2603.25750)
