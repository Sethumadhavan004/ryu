# Ryu — agent notes

Voice-first meeting intelligence. npm-workspaces monorepo:

| Path | What |
|---|---|
| `apps/app` | Expo SDK 57 app (iOS / Android / web). Single immersive surface; phases are state (`src/state/store.ts`), not routes. |
| `apps/server` | Stateless Hono API (`src/app.ts`), the n+1 notes pipeline (`src/pipeline/`), and the LiveKit voice agent (`src/agent.ts`). |
| `packages/core` | Shared types, render helpers, demo fixture. The data contract between app and server. |
| `docs/research` | Research 01–04: the reasoning behind every choice here. Read before changing architecture. |
| `video` | Remotion feature video (not a workspace). Footage is captured deterministically from demo mode; see `video/README.md`. |

Principles that code must keep (see docs/research):
- The server stores nothing (Research 03 §1). Notes live on the device (`apps/app/src/lib/vault*.ts`).
- The ledger is the single source of truth; notes reference atom IDs, never restate facts (Research 04 §B2).
- Anything the code can enforce (evidence IDs exist, completeness, computed person-note lists) is enforced in code, not only in prompts.
- Every animation reflects real state; every voice action has a touch twin.

Commands: `npm run dev` (server + agent + web app), `npm run dev:demo`, `npm run doctor`, `npm run typecheck`, `npm test`.
Before trusting any SDK API from memory, read the installed package's `.d.ts` / bundled docs — Expo, LiveKit and the AI SDK all move fast.
