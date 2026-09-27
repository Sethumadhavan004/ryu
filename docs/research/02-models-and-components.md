# Research 02: Models & Components

> Status: exploration complete, decision proposed · Date: 2026-09-27
> Builds on: [01 — Voice AI Tech Stack](./01-voice-stack.md) (LiveKit + Agents TS, Expo, Next.js)
> Scope: which model/service fills each slot (ears, brain, mouth, voice layer),
> and how the two product modes flow through them.

## 0. Constraints (from the V1 decisions)

| Constraint | Consequence for model choice |
|---|---|
| **English only in V1**, Indic later via Sarvam | Pick the best English models now. Keep the pipeline pluggable so Sarvam slots in as a cascaded path later |
| **Free-tier dev, BYOK for users, open source** | Every slot needs a **$0 default** and a **BYOK upgrade**. We never pay for or proxy anyone's API usage |
| **Expo + Next.js clients** | Capture must work on phone mic (Expo) and in the browser (mic + meeting tab audio) |
| **Core pain point: meeting notes → summary → act on it by voice** | Accuracy, speaker labels and long-audio handling matter *more* than latency for capture |

---

## 1. The key insight: two modes, two pipelines, one brain

The two modes look similar ("voice in") but have opposite requirements:

| | **Mode A: Capture** (meeting notes) | **Mode B: Converse** (talk to Ryu) |
|---|---|---|
| Who talks | Other humans, 30–90 min | You ↔ Ryu, 1–10 min |
| Priority | **Accuracy, who-said-what, completeness** | **Latency, turn-taking, barge-in** |
| Latency tolerance | Seconds for a live draft, minutes for the final | < 800 ms |
| Ryu speaks? | No | Yes |
| Right tool | **Batch/chunked transcription** | **Realtime voice session (LiveKit)** |

**Why this matters (a refinement of Research 01):** LiveKit's free Cloud plan
gives **1,000 agent-session minutes per month**. Routing a one-hour meeting through
a realtime agent would burn 60 of those minutes and pay the realtime premium for
nothing, because nobody needs a reply in under a second while *listening*. So:

- **Capture does not use a LiveKit agent.** The client records and uploads chunks, and the
  server transcribes them. This is cheaper, works offline, and survives network drops.
- **Converse uses LiveKit.** This is where the 01 decision earns its keep.

```
 MODE A — CAPTURE                                  MODE B — CONVERSE
 ────────────────                                  ─────────────────
 mic / tab audio                                   mic ⇄ speaker
     │ record locally, 30 s chunks                     │ WebRTC
     ▼                                                 ▼
 Ryu API ──► Live STT (per chunk) ─► live draft    LiveKit Agent
     │                                   transcript     │  voice layer (S2S) or cascaded
     ▼ on "stop"                                        │  tools: search_notes, update_note,
 Final STT pass (full file, diarized)                   │         create_task, draft_email…
     ▼                                                  │
 Brain: summarise → structured Note ◄───────────────────┘  reads/writes the same notes
                    (tldr, decisions, action items, topics, speakers)
```

The **Brain** is the shared centre. Capture *writes* notes, Converse *reads and
edits* them. That's the "handle it as per need through voice" loop.

---

## 2. Slot-by-slot

### 2a. Ears for Capture: live draft STT

Goal: text appears within seconds while the meeting runs. Speaker labels are not required yet.

| Option | Free allowance | Notes |
|---|---|---|
| **Groq `whisper-large-v3-turbo`** ✅ default | ~28,800 audio-s/day ≈ **8 h/day**, 7,200 s/h, 2,000 req/day; 10 s billing minimum per request | Very fast, OpenAI-compatible API. **No diarization.** 30 s chunks fit the limits well |
| Gemini Flash (audio input) | Free tier, quota shown in AI Studio | Slower per chunk; better saved for the final pass |
| On-device (Moonshine Web / Whisper WebGPU; sherpa-onnx on mobile) | Truly free, private, offline | Web: Chrome/Edge + WebGPU, ~120–150 MB model download. Good **privacy-mode** option later |

### 2b. Ears for Capture: final diarized pass

Goal: the high-quality transcript with **who said what**, run once on the full recording
after "stop". Chunked transcription can't do this well, because speaker "A" in chunk 3
isn't guaranteed to be "A" in chunk 7. So we re-run once on the whole file. It's like a
live draft and a final copy.

| Option | Free allowance | Diarization quality (cpWER, lower = better) | Notes |
|---|---|---|---|
| **AssemblyAI Universal-3.5 Pro (async)** ✅ BYOK default | **$50 credit** ≈ 200 h at ~$0.23/h incl. diarization | **30.17** (best reported) | Built for exactly this; long files natively |
| Deepgram Nova-3 (pre-recorded) | **$200 credit**, doesn't expire (~435 h) | 37.92 | Diarization included in the pre-recorded price; fastest |
| ElevenLabs Scribe v2 | Plan-based | 35.26 | Strong multilingual (useful later) |
| **Gemini Flash (prompted)** ✅ $0 fallback | Free tier | Not benchmarked; 3+ speakers "experimental" | Structured JSON output. Diarization/timestamps capped at **~30 min per request**, so a long meeting needs splitting with overlap |

**Decision:** default final pass = **AssemblyAI** (one free key covers roughly 200 meeting-hours,
which is effectively free for a personal user). If no AssemblyAI key is set, fall back
to **Gemini** so the app still works with a single free Google key.

### 2c. Brain: summarisation and reasoning (text LLM)

A 1-hour meeting is roughly 9–10k words (about 13k tokens), which fits in one call on any modern
model. So we use **single-pass structured summarisation**, not the older chunk-and-merge
("map-reduce") approach. The model sees the whole meeting at once, so it can connect a
decision in minute 50 to the problem raised in minute 5.

| Option | Free allowance | Why |
|---|---|---|
| **Gemini Flash (3.x)** ✅ default | Free tier, no card, not a trial; ~1.5k req/day reported | 1M-token context, native JSON-schema output, and the **same key** as Converse and fallback STT |
| Groq `gpt-oss-120b` | ~200k tokens/day free | Very fast; good for quick tool-calling turns |
| Mistral (Experiment tier) | ~1B tokens/month | ⚠ Requires opting into training on your data, so not for meeting content |
| BYOK: Claude / GPT / etc. | User's key | Best quality for users who want it |

The output is a **typed Note object**, not free prose. That's what makes voice actions possible later:

```ts
Note {
  title, tldr,
  speakers: { label, name? }[],
  decisions: { text, quote_ts }[],
  actionItems: { task, owner?, due?, quote_ts }[],
  openQuestions: string[],
  topics: { title, start_ts, end_ts, summary }[]
}
```

Every item carries a timestamp pointing back into the transcript, so Ryu can
answer "*where did we decide that?*" and play the exact moment. It also keeps
the model honest, because a claim has to point at evidence.

**Provider abstraction for the brain:** use the **Vercel AI SDK** (`ai` package).
It gives one TS interface over Google, Groq, OpenAI, Anthropic and any
OpenAI-compatible endpoint, with Zod-schema structured output. BYOK then becomes
config, not code.

### 2d. Voice layer for Converse

| Option | Cost to user | Strengths | Weaknesses |
|---|---|---|---|
| **Gemini 3.8 Live** ✅ default | **Free tier** (launched 15 Sep 2026; free input+output tokens; free content may be used by Google) | Native audio, async (non-blocking) function calling by default, good noise/interrupt handling, LiveKit plugin | Free-tier limits unpublished (check AI Studio); 15-min audio-session cap without context compression |
| Gemini 3.8 Live *Extended Thinking* | Free tier | Background reasoning while it keeps talking, suited to "go through last week's meetings…" | Async-only tools; slower on hard asks |
| **GPT-Live-1** (BYOK premium) | $0.05/min + brain tokens | Full-duplex, best reported turn-taking (+30 pts Full-Duplex-Bench vs realtime-2.1), clean delegation to a backend brain | Paid only; no structured outputs |
| **Cascaded** (Deepgram Flux/Nova-3 STT → Groq/Gemini LLM → Deepgram Aura-2 / Cartesia TTS) | Deepgram $200 credit + free LLM | Full control, readable text at every hop, and **the path Sarvam plugs into for Indic** | More hops = more latency to tune |

**Decision:** default to **Gemini 3.8 Live through the LiveKit Google plugin**. It's the only
option that is realtime speech-to-speech *and* free. Its tools call the Brain
(`search_notes`, `get_note`, `update_action_item`, `create_task`, …). Offer
**GPT-Live-1** and **Cascaded** as config switches. Build the cascaded path early anyway,
because it's our debugging baseline and the future Indic route.

### 2e. Mouth (TTS): cascaded path only

In S2S mode the voice model speaks for itself. TTS only matters for the cascaded path,
and for things like "read me the summary".

| Option | Free | Latency (TTFA) | Notes |
|---|---|---|---|
| **Deepgram Aura-2** ✅ | Same $200 credit as STT | ~90 ms | One key covers both ears and mouth |
| Cartesia Sonic 3/3.5 | Limited free tier | ~40–80 ms | Fastest reported |
| ElevenLabs Flash v2.5 | Free-tier characters | ~75 ms | Best voice quality; smallest free allowance |
| **Kokoro-82M** (local, `kokoro-js`/sherpa-onnx) | Truly free | Device-dependent | Offline/privacy fallback |

---

## 3. Latency budget for Converse

This is where the < 800 ms target in Research 01 goes.

```
                         Cascaded (tuned)        S2S (Gemini Live / GPT-Live)
 end-of-turn detection   200–300 ms              built in (~200–300 ms)
 STT finalisation        100–200 ms              —
 LLM first token         150–400 ms              ┐
 TTS first audio          50–100 ms              ┘ 250–500 ms (one model)
 network + jitter buffer 100–150 ms              100–150 ms
 ─────────────────────────────────────────────────────────────
 total                   ~600–1150 ms            ~550–950 ms
```

The single biggest lever is the **turn detector** (Research 01), not the model.
The second is **streaming everything**: LLM tokens go to TTS sentence by sentence, and
TTS audio goes to the speaker frame by frame. Nothing should wait for a "complete" result.

---

## 4. Capture details that decide whether Mode A actually works

| Platform | Meeting type | How we capture | Caveat |
|---|---|---|---|
| **Web (Next.js)** | Online (Meet/Zoom/Teams in browser) | `getDisplayMedia` **tab audio** + `getUserMedia` mic, recorded as **stereo (mic L / tab R)**, not mixed. See [03 §4c](./03-brain-and-data.md#4c-ryus-speaker-strategy-an-evidence-ladder) → `MediaRecorder` | Tab-audio sharing works reliably only in Chromium; the user picks the tab. No bot joins the call |
| **Web** | In-person | Mic only | — |
| **Mobile (Expo)** | In-person | `expo-audio` recorder, iOS `UIBackgroundModes: audio` so it keeps recording when locked | iOS/Android **cannot capture other apps' audio**. For online calls on a phone, use speakerphone + mic |
| Both | Any | **Record locally first, upload 30 s chunks, retry on reconnect** | Offline-first: a dead network must never lose a meeting |

A meeting bot that joins calls (Recall.ai-style) is **out of scope for V1**.
It's paid infrastructure and not needed once tab capture exists.

---

## 5. BYOK: how keys work without us handling them

Keys must reach the **server** (LiveKit agent, STT calls), so "BYOK" really means
**bring your own deployment**:

1. **Self-host (primary V1 path):** `docker compose up` runs Next.js web + Ryu API/agent
   worker + **open-source LiveKit server**. Keys live in the user's own `.env`. There are no LiveKit
   minute limits, and nothing passes through us. This is the standard OSS model.
2. **LiveKit Cloud free plan** for users who don't want to run LiveKit themselves (their own project keys).
3. *(Later)* A hosted demo where users paste keys that are kept encrypted per-user. This needs
   real key-custody design, so it's deferred.

**Minimum viable key set:** a single free **Google AI Studio key** runs everything
(Gemini Live + Gemini transcription + Gemini summarisation). Each extra key adds quality:

| Keys set | What you get |
|---|---|
| Google only | Full app, $0 |
| + Groq | Faster live draft transcript |
| + AssemblyAI | Best final transcript and speaker labels |
| + Deepgram | Cascaded voice mode (and a fast diarized alternative) |
| + OpenAI | GPT-Live-1 premium voice |

---

## 6. Cost check: one realistic week on defaults

5 one-hour meetings plus 30 minutes of talking to Ryu:

| Slot | Usage | Cost to user |
|---|---|---|
| Live draft (Groq) | 5 h, max ~1 h/day | $0 (≈ 1/8 of the daily free allowance per meeting) |
| Final pass (AssemblyAI) | 5 h | ~$1.15 **of the $50 free credit** |
| Summaries (Gemini Flash) | 5 × ~15k tokens | $0 |
| Converse (Gemini 3.8 Live) | 30 min | $0 (free tier) |
| LiveKit | 30 agent-min | $0 (self-host, or 3% of Cloud free plan) |

---

## 7. Risk: free tiers are volatile, so abstraction is mandatory

In 2026 alone: Cerebras turned its free tier into a card-required trial, GitHub Models
shut down, OpenRouter's June free models all went paid, and sources disagree on
whether Groq's free plan still includes Llama. **Any hard-coded free provider will
break.** So:

- Every slot is behind an interface (`LiveSTT`, `FinalSTT`, `Brain`, `VoiceLayer`, `TTS`)
  and is chosen in one config file / env var.
- A `ryu doctor` command checks which keys are set and which providers answer.
- Research docs carry a "last verified" date. Re-check before each release.

---

## 8. Proposed defaults (summary)

| Slot | Default ($0) | BYOK upgrade | Later |
|---|---|---|---|
| Live draft STT | Groq whisper-large-v3-turbo | Deepgram Nova-3 streaming | On-device Moonshine / sherpa-onnx |
| Final diarized STT | Gemini Flash (prompted) | **AssemblyAI Universal-3.5 Pro** | Sarvam Saaras (Indic) |
| Brain | Gemini Flash via Vercel AI SDK | Claude / GPT / Groq gpt-oss | — |
| Voice layer | **Gemini 3.8 Live** (LiveKit plugin) | GPT-Live-1 | Cascaded w/ Sarvam (Indic) |
| TTS (cascaded) | Kokoro (local) | Deepgram Aura-2 / Cartesia | Sarvam Bulbul |

## 9. Open questions → Research 03 (Brain & Data)

1. **Storage:** where notes, transcripts and audio live. Local-first (SQLite on device /
   IndexedDB) vs a server DB (Postgres + pgvector, e.g. Supabase free tier).
2. **Retrieval:** embeddings + search so Ryu can answer "what did Priya say about the launch
   *last month*?" (across meetings, not just one).
3. **Memory & actions:** which voice actions V1 ships (edit a note, follow-up email draft,
   tasks → calendar/Todoist?) and the tool schema for them.
4. **Audio retention:** keep raw audio (replay "that moment") or delete after the final pass (privacy)?

---

## Sources

*Figures are as reported by the sources below in Sept 2026. Several vendor pages
could not be opened directly from the research environment, so treat numbers as
"verify in the provider console" and check them in the prototype.*

- STT comparisons & diarization: [AssemblyAI free STT options](https://www.assemblyai.com/blog/the-top-free-speech-to-text-apis-and-open-source-engines) · [AssemblyAI diarization roundup](https://www.assemblyai.com/blog/top-speaker-diarization-libraries-and-apis) · [Deepgram vs Google vs AssemblyAI](https://deepgram.com/learn/deepgram-vs-google-vs-assemblyai) · [FutureAGI STT guide](https://futureagi.com/blog/speech-to-text-apis-in-2026-benchmarks-pricing-developer-s-decision-guide/) · [Coval benchmarks](https://www.coval.ai/blog/best-speech-to-text-providers-in-2026-independent-benchmarks-and-how-to-choose/) · [Northflank open-source STT](https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks) · [Gladia STT roundup](https://www.gladia.io/blog/best-speech-to-text-apis)
- STT pricing/credits: [AssemblyAI vs Deepgram pricing](https://aibizhub.io/articles/deepgram-vs-assemblyai-pricing-2026/) · [Transcription API costs (Jul 2026)](https://www.buildmvpfast.com/api-costs/transcription) · [Deepgram pricing breakdown](https://diyai.io/ai-tools/speech-to-text/deepgram-pricing-2026/)
- Groq: [Whisper Large v3 Turbo docs](https://console.groq.com/docs/model/whisper-large-v3-turbo) · [Rate limits](https://console.groq.com/docs/rate-limits) · [Free tier limits 2026](https://www.grizzlypeaksoftware.com/articles/p/groq-api-free-tier-limits-in-2026-what-you-actually-get-uwysd6mb) · [Groq free tier changes](https://klymentiev.com/blog/groq-pricing)
- Free LLM tiers: [OpenRouter: free LLM APIs compared](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/) · [Free LLM API tiers 2026](https://ianlpaterson.com/blog/free-llm-api-2026/) · [Free LLM API catches](https://continuumcode.ai/guides/free-llm-api/)
- Gemini: [Pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Free tier guide](https://pecollective.com/tools/gemini-free-tier-guide/) · [Audio transcription](https://ai.google.dev/gemini-api/docs/transcribe) · [Audio understanding](https://ai.google.dev/gemini-api/docs/audio) · [Gemini 3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live) · [3.8 Live Extended Thinking](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live-extended-thinking) · [Live API capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities) · [DataCamp on 3.8 Live](https://www.datacamp.com/blog/gemini-3-8-live)
- TTS: [Gradium TTS for voice agents](https://gradium.ai/content/best-text-to-speech-api-voice-agents) · [MarkTechPost TTS benchmark](https://www.marktechpost.com/2026/05/30/best-text-to-speech-tts-models-in-2026-a-benchmark-based-comparison/) · [BentoML open-source TTS](https://www.bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models) · [Inworld TTS APIs](https://inworld.ai/resources/best-text-to-speech-apis)
- LiveKit: [Quotas & limits](https://docs.livekit.io/deploy/admin/quotas-and-limits/) · [LiveKit free tier](https://agentdeals.dev/vendor/livekit) · [Agent cloud deployment](https://livekit.com/products/agent-cloud-deployment)
- Capture: [Tab + mic recording with MediaRecorder](https://dev.to/puspaksahu17/how-to-record-google-meet-and-zoom-calls-with-dual-audio-using-the-html5-mediarecorder-api-611) · [No-bot meeting assistant guide](https://livesuggest.ai/blog/no-bot-meeting-assistant/) · [expo-audio docs](https://docs.expo.dev/versions/latest/sdk/audio/) · [expo-audio 2026 guide](https://reactnativerelay.com/article/expo-audio-tutorial-react-native-audio-playback-recording-migration-expo-av-2026)
- On-device: [Moonshine Web](https://huggingface.co/posts/Xenova/486935205804807) · [whisper-web](https://github.com/xenova/whisper-web) · [Browser Whisper comparison](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/)
