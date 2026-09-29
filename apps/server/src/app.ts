import type { LiveAtom, ProcessEvent, ProcessMeta } from "@ryu/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import { env, providers } from "./env";
import { defaultBrain, structured } from "./llm";
import { LIVE_SYSTEM, livePrompt } from "./pipeline/prompts";
import { runPipeline } from "./pipeline/run";
import { liveLedgerOut } from "./pipeline/schemas";
import { transcribeChunk, transcribeFinal } from "./stt";
import { issueToken, type AgentJobMeta } from "./token";

/**
 * Stateless by design (Research 03 §1): every request is a pure function of
 * its inputs + the operator's keys. Nothing is written to disk or kept.
 */
export const app = new Hono();

/**
 * The server spends the operator's API keys, so an arbitrary website open in
 * the same browser must not be able to call it. Default: allow only origins on
 * this machine or the LAN (the phone/web app). Native apps send no Origin and
 * are unaffected. Override with RYU_CORS_ORIGIN (comma-separated, or "*").
 */
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/;
export function allowOrigin(origin: string): string | null {
  if (env.corsOrigin) {
    if (env.corsOrigin === "*") return origin;
    return env.corsOrigin.split(",").map((o) => o.trim()).includes(origin) ? origin : null;
  }
  try {
    return LOCAL_HOST.test(new URL(origin).hostname) ? origin : null;
  } catch {
    return null;
  }
}

app.use("*", cors({ origin: allowOrigin, allowHeaders: ["content-type", "x-ryu-meta"], exposeHeaders: ["x-ryu-engine"] }));

app.onError((err, c) => {
  console.error("[server]", err);
  return c.json({ error: err.message }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true, providers: providers() }));

app.post("/api/token", async (c) => {
  const meta = (await c.req.json().catch(() => ({ mode: "boot" }))) as AgentJobMeta;
  return c.json(await issueToken({ mode: meta.mode ?? "boot", brief: meta.brief?.slice(0, 2000) }));
});

/** Live draft: one audio chunk in, text out. */
app.post("/api/stt/chunk", async (c) => {
  const type = c.req.header("content-type") ?? "audio/wav";
  const audio = new Uint8Array(await c.req.arrayBuffer());
  if (audio.byteLength < 2000) return c.json({ text: "", engine: "skipped" });
  const r = await transcribeChunk(audio, type.split(";")[0]);
  c.header("x-ryu-engine", r.engine);
  return c.json(r);
});

/** Live ledger delta (P6): provisional items while the meeting runs. */
app.post("/api/live-ledger", async (c) => {
  const body = (await c.req.json()) as { window: string; current: LiveAtom[]; hint?: string[] };
  if (!body.window?.trim()) return c.json({ atoms: [] });
  const brain = defaultBrain();
  const out = await structured({
    model: brain.lite,
    schema: liveLedgerOut,
    system: LIVE_SYSTEM,
    prompt: livePrompt({
      current: body.current.map((a) => `- [${a.kind}] ${a.text}`).join("\n") || "(empty)",
      window: body.window.slice(-6000),
      hint: body.hint ?? [],
    }),
    temperature: 0.1,
  });
  return c.json(out);
});

/**
 * Full n+1 pipeline. Body = raw audio; meta in the `x-ryu-meta` header.
 * Response = NDJSON stream of ProcessEvents (one JSON object per line).
 */
app.post("/api/process", async (c) => {
  const meta = JSON.parse(decodeURIComponent(c.req.header("x-ryu-meta") ?? "%7B%7D")) as ProcessMeta;
  const mediaType = (c.req.header("content-type") ?? "audio/webm").split(";")[0];
  const audio = new Uint8Array(await c.req.arrayBuffer());
  const brain = defaultBrain();
  const ac = new AbortController();
  c.header("content-type", "application/x-ndjson; charset=utf-8");
  c.header("cache-control", "no-cache");
  return stream(c, async (s) => {
    s.onAbort(() => ac.abort());
    const send = (e: ProcessEvent) => s.write(JSON.stringify(e) + "\n");
    try {
      const expected = meta.participantsHint?.length ? meta.participantsHint.length + 1 : undefined;
      for await (const e of runPipeline({
        meta: { title: meta.title || "Untitled meeting", startedAt: meta.startedAt || new Date().toISOString(), participantsHint: meta.participantsHint ?? [], tzOffsetMin: Number.isFinite(meta.tzOffsetMin) ? meta.tzOffsetMin : 0 },
        brain,
        transcribe: () => transcribeFinal(audio, mediaType, { speakersExpected: expected, signal: ac.signal }),
        signal: ac.signal,
      })) {
        await send(e);
      }
    } catch (err) {
      console.error("[process]", err);
      await send({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  });
});
