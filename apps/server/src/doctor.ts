/**
 * `npm run doctor` — which keys are set, and which providers actually answer.
 * Free tiers change often (Research 02 §7); this is the first thing to run.
 */
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { RoomServiceClient } from "livekit-server-sdk";
import { env, providers } from "./env";

const ok = (s: string) => console.log(`  \x1b[32m✔\x1b[0m ${s}`);
const bad = (s: string) => {
  process.exitCode = 1;
  console.log(`  \x1b[31m✘\x1b[0m ${s}`);
};
const info = (s: string) => console.log(`  \x1b[90m·\x1b[0m ${s}`);

async function check(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    bad(`${name} — ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
}

console.log("\nRYU doctor\n");
for (const [slot, p] of Object.entries(providers())) (p ? ok : bad)(`${slot.padEnd(9)} ${p ?? "not configured"}`);
console.log("");

if (env.googleKey) {
  // A stale system-level key silently beats .env (--env-file never overrides).
  info(`Google key in use ends …${env.googleKey.slice(-4)}`);
  await check(`Gemini text (${env.llmModel})`, () =>
    generateText({ model: google(env.llmModel), prompt: "Reply with OK.", maxRetries: 0 }),
  );
  await check(`Gemini lite (${env.llmLiteModel})`, () =>
    generateText({ model: google(env.llmLiteModel), prompt: "Reply with OK.", maxRetries: 0 }),
  );
  await check(`Gemini Live model (${env.liveModel})`, async () => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.liveModel}`, {
      headers: { "x-goog-api-key": env.googleKey! },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} — this key can't see the Live model`);
  });
} else info("GOOGLE_API_KEY missing — get one free at https://aistudio.google.com/apikey");

if (env.groqKey) {
  await check("Groq", async () => {
    const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${env.groqKey}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
} else info("GROQ_API_KEY missing (optional) — faster live transcript");

if (env.assemblyKey) {
  await check("AssemblyAI", async () => {
    const r = await fetch("https://api.assemblyai.com/v2/transcript?limit=1", { headers: { authorization: env.assemblyKey! } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
} else info("ASSEMBLYAI_API_KEY missing (optional) — best speaker labels");

if (env.livekitUrl) {
  await check(`LiveKit reachable (${env.livekitUrl})`, async () => {
    const http = env.livekitUrl!.replace(/^ws/, "http");
    const r = await fetch(http, { signal: AbortSignal.timeout(5000) });
    if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
  });
  // Reachability alone passes a wrong key/secret; an authenticated call doesn't.
  if (env.livekitKey && env.livekitSecret) {
    await check("LiveKit key/secret accepted", () =>
      new RoomServiceClient(env.livekitUrl!.replace(/^ws/, "http"), env.livekitKey!, env.livekitSecret!).listRooms(),
    );
  } else bad("LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing");
} else info("LIVEKIT_URL missing — voice control disabled (run `livekit-server --dev` or use LiveKit Cloud)");
console.log("");
