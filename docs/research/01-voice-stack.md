# Research 01 — Voice AI Tech Stack

> Status: exploration complete, decision proposed · Date: 2026-09-27
> Goal: an interactive, fast, near-human voice experience on web + mobile.
> Scope: the *platform* layer only (transport, orchestration, client). Model
> choices (STT / LLM / TTS / speech-to-speech) are Research 02.

---

## 1. What "almost human" actually means (the target we're optimising for)

Humans hand the floor back and forth with a median gap of roughly **200 ms**,
and people start noticing lag at around **500 ms**. They find it clearly robotic
past about **1 s**. So "feels human" breaks down into four measurable properties:

| Property | What it means | Target |
|---|---|---|
| **Voice-to-voice latency** | User stops talking → first audible reply | < 800 ms (p50), stretch < 500 ms |
| **Turn detection** | Knowing the user is *done* vs just *pausing* | Semantic, not a silence timer |
| **Barge-in** | User talks over Ryu → Ryu stops instantly and listens | < 200 ms to silence |
| **Full-duplex** | Listening *while* speaking (backchannels, "mm-hm", recovery) | Nice to have → will become table stakes |

Every stack decision below should be judged against these four.

### Why the current Ryu can't hit these

The current code (`src/core/orchestrator/session.ts`) uses:

1. **Push-to-talk.** The user decides the turn, so there is no natural turn-taking at all.
2. **An 800 ms settle timer** after release. That spends the entire latency budget before the LLM even starts.
3. **Raw WebSocket audio from the browser.** WebSocket runs over TCP, so one lost packet stalls
   everything behind it (head-of-line blocking). It also comes with no echo cancellation, jitter
   buffer, or packet-loss handling, and those are what make barge-in reliable.
4. **A hand-rolled orchestrator.** It has its own state machine, sentence splitter, barge-in
   generation counter, and turn queue. All of this is solved, commodity infrastructure in 2026.

None of this was wrong to build (it's how you learn the moving parts). But this is
exactly the layer to **buy/adopt, not build**.

---

## 2. The anatomy of a voice agent (the mental model)

Every voice AI product, whatever the vendor, is these five layers:

```
 ┌──────────── CLIENT (web / iOS / Android) ────────────┐
 │ mic capture · AEC/noise suppression · playback · UI  │
 └───────────────▲──────────────────────┬───────────────┘
                 │   (1) TRANSPORT      │   WebRTC ≫ WebSocket for client audio
 ┌───────────────┴──────────────────────▼───────────────┐
 │ (2) ORCHESTRATION  VAD · turn detection · barge-in · │  ← LiveKit Agents / Pipecat
 │     streaming glue · state · tool calls · metrics    │
 └───────┬──────────────────┬──────────────────┬────────┘
         │ (3) EARS         │ (4) BRAIN        │ (5) MOUTH
         │  STT             │  LLM + tools     │  TTS
         └──────────────────┴──────────────────┘
          …or (3)+(4)+(5) collapsed into ONE speech-to-speech model
```

The big architectural fork is the bottom row:

| Architecture | How it works | Pros | Cons |
|---|---|---|---|
| **Cascaded** (STT → LLM → TTS) | Three streaming models chained with text in between | Full control, swap any part, best-in-class LLM + tools, cheap, easy to debug (you can read the text) | Each hop adds latency; loses tone/emotion from the user's voice |
| **Speech-to-speech (S2S)** | One model hears audio and speaks audio (gpt-realtime-2, Gemini 3.x Live) | Lowest latency, hears tone, very natural | Weaker at complex reasoning/tools, harder to steer, vendor lock-in, pricier |
| **Split / delegation** *(the 2026 pattern)* | A fast full-duplex *voice layer* handles conversation; it delegates thinking and tools to a separate *brain* model | Human-feeling conversation **and** a strong brain | Newest pattern, so the tooling is youngest |

The third row is the important 2026 development. OpenAI's **GPT-Live-1** (API launch
10 Sep 2026) is built this way: the voice model listens and speaks at the same
time and hands reasoning and tool calls to a backend model ("delegation"). This
maps almost perfectly onto a **Note Buddy**. The fast voice layer talks, and the
brain handles notes, memory and retrieval.

---

## 3. Options surveyed

### 3a. Open-source orchestration frameworks (you own the code)

| | **LiveKit Agents** | **Pipecat** (Daily) | TEN Framework | Bolna |
|---|---|---|---|---|
| Model | Agent joins a WebRTC "room" as a participant | Frame pipeline (Python) | Graph-based multimodal | Telephony-first, config-driven |
| Languages | **Python + Node.js/TS** (agents-js 1.5) | Python only | C++/Go/Python | Python |
| Transport | Own WebRTC SFU (OSS or Cloud), SIP native | Daily WebRTC, SmallWebRTC, WebSocket, new MoQ/QUIC | Agora etc. | Telephony |
| Turn detection | **Built-in audio + semantic turn detector** (acoustic + meaning), in both Python and Node | Smart Turn model / LLM-based | — | Basic |
| S2S plugins | OpenAI realtime, Gemini Live, … | OpenAI, Gemini, … | Some | Few |
| Clients | Web, React, **React Native/Expo**, Swift, Kotlin, Flutter, Unity | Web, React, React Native, iOS, Android | — | — |
| Scale story | Production SFU, LiveKit Cloud, native telephony | You bring infra (or Daily/Pipecat Cloud) | — | — |
| Best for | Web+mobile realtime products | Python-first voice pipelines, max integrations | Multimodal graphs | Phone bots fast |

### 3b. Managed voice-agent platforms (they own the stack)

**Vapi, Retell, ElevenLabs Agents, Bland.** These platforms are fast to ship and mostly
built for **phone call-centre bots**. Reported end-to-end latencies have a median of
around 1.7–2.3 s and a p95 around 3 s. They cost about $0.07–0.15/min all-in and
you give up control of the pipeline. **Wrong fit for Ryu.** Ryu is an app-embedded
companion whose value is its custom brain (notes and memory), and "super cool to
use" needs latency we can tune ourselves.

### 3c. Direct speech-to-speech APIs (the model is the stack)

| | GPT-Live-1 | gpt-realtime-2 | Gemini 3.x Live (3.1 Flash → 3.8) |
|---|---|---|---|
| Released | 10 Sep 2026 | 7 May 2026 | 3.1 Flash: Mar 2026 · 3.8: 15 Sep 2026 |
| Style | **Full-duplex** voice layer + delegated brain | Single model: hears, reasons, speaks | Single native-audio model |
| Transport | WebRTC, WebSocket, SIP | WebRTC, WebSocket, SIP | WebSocket (ephemeral tokens for clients) |
| Price (reported) | $0.05/min voice layer **+ brain tokens** | Token-based, premium | ~$0.02–0.04/min, "orders of magnitude cheaper" |
| Notes | +30 pts Full-Duplex-Bench vs realtime-2.1; 12 voices; no structured outputs | Strongest reasoning in S2S, 60-min sessions | 200+ languages, good noise/interrupt handling, 15-min audio session cap w/o compression |

You *can* connect a browser straight to one of these. **Don't make that the
architecture, though.** It locks Ryu to one vendor, and you lose the server-side seat
where memory, notes and tools live. The right move is to use them **as plugins
inside the orchestration layer**, so one config line can swap GPT-Live ↔ Gemini ↔
cascaded.

### 3d. Open / self-hosted full-duplex models (watch list)

**Kyutai Moshi** (~200 ms, true full-duplex), **Kyutai Unmute** (modular low-latency
cascade), **Sesame CSM-1B** (expressive TTS, not a full brain), plus research
systems (PersonaPlex, JoyAI-Talker, DuplexSLA). They're impressive, but they need your own
GPUs, are English-centric and have weak tool use. They're good for a later cost or privacy
phase, not v1.

### 3e. On-device (offline / privacy tier)

**sherpa-onnx** (STT/TTS/VAD on iOS/Android, has a React Native TurboModule),
**Moonshine** (tiny streaming STT), **Kokoro-82M** (TTS that runs on mid-range
phones). Useful later for offline notes, wake-word, or on-device VAD to cut
bandwidth. They aren't good enough to be the main conversational engine yet.

---

## 4. Recommendation

```
 Web: Next.js + @livekit/components-react     Mobile: Expo (React Native) + @livekit/react-native
                        \                          /
                         \──── WebRTC (LiveKit) ──/
                                     │
                     LiveKit Agents worker (TypeScript, agents-js)
                     ├─ VAD + LiveKit audio/semantic turn detector
                     ├─ Pipeline: pluggable ─┬─ S2S / voice layer (GPT-Live-1 or Gemini Live)
                     │                        └─ Cascaded (STT → LLM → TTS) — e.g. Sarvam for Indic
                     └─ Ryu Brain (ours): notes, memory, retrieval, tools  ← the actual product
```

**Pick: LiveKit (WebRTC) + LiveKit Agents in TypeScript.** Reasons, mapped to the
four targets:

1. **Latency and barge-in.** WebRTC runs over UDP with built-in echo cancellation, jitter buffers
   and packet-loss handling. That is the transport-level requirement for sub-second, interruptible
   speech. LiveKit is WebRTC-native, and its media layer is its core strength.
2. **Turn detection.** The built-in turn detector combines acoustics (intonation, rhythm)
   with meaning. That directly replaces push-to-talk and the 800 ms settle timer, and it now ships
   in Node (`@livekit/agents` ≥ 1.4.7).
3. **Web + mobile from one backend.** First-party SDKs for React, React Native/Expo,
   Swift, Kotlin and Flutter. Pipecat has clients too, but LiveKit's mobile and SFU story is
   more mature.
4. **Model-agnostic.** OpenAI realtime/Live, Gemini Live and Sarvam all have plugins,
   so Research 02 can A/B models without re-architecting.
5. **One language.** You already write TS. The agent, web app and mobile app share
   types and a mental model. *Trade-off:* the Python SDK is the "original" and
   gets features first. If we hit a Node gap, the fallback is a Python agent
   worker while keeping the TS clients (the clients don't care what language the agent uses).
6. **Escape hatch.** LiveKit server is open source (self-host) *or* LiveKit Cloud
   (start here: free tier, zero ops). No lock-in either way.

**Runner-up: Pipecat.** It's the better choice if we wanted a Python-only, integration-heavy
pipeline. We'd reconsider it if the Node SDK becomes a real blocker.

**Rejected:** managed platforms (phone-bot oriented, slow, opaque), direct
browser→S2S (lock-in, no server seat for the brain), self-hosted full-duplex
(too early for v1).

### What happens to the existing code

| Current | Fate |
|---|---|
| `server.ts` custom WS server | Replaced by LiveKit room + agent worker |
| `orchestrator/session.ts`, `sentence-splitter.ts` | Replaced by LiveKit `AgentSession` |
| `speech/sarvam.ts` | Replaced by `@livekit/agents-plugin-sarvam` if Indic is needed |
| `intelligence/*`, `tools/*`, `agent/*` | Concepts survive → become the **Ryu Brain** |
| Next.js app | Stays as the web client, restyled (no persona theme) |

---

## 5. Open questions (these decide Research 02)

1. **Languages.** English only, or Indic (Malayalam/Hindi/…) too? This single
   answer decides between GPT-Live/Gemini (broad but uneven accents) and a
   cascaded Sarvam path.
2. **Mobile.** Is Expo/React Native acceptable, or do you want native Swift/Kotlin?
3. **Budget posture.** Is optimising for the best feel at about $0.05–0.10/min OK for now?
4. **Note Buddy core loop.** Always-listening capture (meetings/lectures) vs
   conversational (you talk *to* Ryu)? These have very different turn-taking and cost profiles.

---

## Sources

- LiveKit — [Open-source voice/video agent frameworks](https://livekit.com/blog/best-open-source-voice-and-video-ai-agent-frameworks) · [Turn detector docs](https://docs.livekit.io/agents/logic/turns/turn-detector/) · [Solving end-of-turn detection](https://livekit.com/blog/solving-end-of-turn-detection) · [agents-js](https://github.com/livekit/agents-js) · [Sarvam plugin](https://docs.livekit.io/agents/models/tts/sarvam/)
- Framework comparisons — [Techsy](https://techsy.io/en/blog/best-open-source-voice-agent-frameworks) · [Evalgent](https://www.evalgent.com/blog/pipecat-vs-livekit) · [Reactify](https://www.reactify-solutions.com/articles/voice-ai-agents-production-2026) · [Forasoft](https://www.forasoft.com/blog/article/livekit-ai-agents-guide)
- Pipecat — [Releases](https://github.com/pipecat-ai/pipecat/releases) · [RN transports](https://github.com/pipecat-ai/pipecat-client-react-native-transports)
- GPT-Live-1 — [OpenAI announcement](https://openai.com/index/introducing-gpt-live-1-in-the-api/) · [Delegation guide](https://developers.openai.com/api/docs/guides/live-delegation) · [DataNorth](https://datanorth.ai/news/openai-launches-gpt-live-1-in-the-api) · [AIToolly](https://aitoolly.com/ai-news/article/2026-09-11-openai-releases-gpt-live-1-in-the-api-powering-natural-full-duplex-voice-conversations-telephony-and)
- S2S comparisons — [Webscraft](https://webscraft.org/blog/gptrealtime2-vs-gemini-live-api-scho-obrati-dlya-golosovogo-agenta-u-2026-rotsi?lang=en) · [Flowtivity](https://flowtivity.ai/blog/gemini-3-1-flash-live-vs-gpt-realtime-1-5-voice-agent-comparison-2026/) · [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Gemini session limits](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/start-manage-session)
- Managed platforms — [Retell benchmark](https://www.retellai.com/blog/retell-vs-bland-vs-vapi-vs-elevenlabs) · [Devaland pricing](https://devaland.com/blog/voice-ai-pricing-comparison-2025)
- Full-duplex / open — [Moshi paper](https://kyutai.org/Moshi.pdf) · [Spheron S2S deploy](https://www.spheron.network/blog/speech-to-speech-gpu-cloud-moshi-sesame-csm-hertz-dev/) · [HumDial challenge](https://arxiv.org/pdf/2604.21406)
- On-device — [sherpa-onnx](https://k2-fsa.github.io/sherpa/onnx/) · [react-native-sherpa-onnx](https://github.com/XDcobra/react-native-sherpa-onnx) · [On-device landscape H1 2026](https://offlinetts.com/blog/tts-stt-landscape-h1-2026/)

*Vendor latency and price figures are as reported by the linked sources in
Sept 2026. We'll verify them with our own measurements in the prototype.*
