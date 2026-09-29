/**
 * Configuration + provider selection (Research 02 §5: BYOK = keys in .env).
 * One Google key runs everything; each extra key upgrades one slot.
 */

const get = (k: string) => {
  const v = process.env[k]?.trim();
  return v ? v : undefined;
};

export const env = {
  port: Number(get("RYU_SERVER_PORT") ?? 8787),
  /** Unset = only local / private-network browser origins (see app.ts). */
  corsOrigin: get("RYU_CORS_ORIGIN"),

  googleKey: get("GOOGLE_API_KEY") ?? get("GOOGLE_GENERATIVE_AI_API_KEY"),
  groqKey: get("GROQ_API_KEY"),
  assemblyKey: get("ASSEMBLYAI_API_KEY"),

  livekitUrl: get("LIVEKIT_URL"),
  livekitKey: get("LIVEKIT_API_KEY"),
  livekitSecret: get("LIVEKIT_API_SECRET"),
  agentName: get("RYU_AGENT_NAME") ?? "ryu",

  /** Text brain: ledger, verify, notes. Alias tracks Google's current Flash. */
  llmModel: get("RYU_LLM_MODEL") ?? "gemini-flash-latest",
  llmLiteModel: get("RYU_LLM_LITE_MODEL") ?? "gemini-flash-lite-latest",
  /** Realtime voice layer (Converse mode). */
  liveModel: get("RYU_LIVE_MODEL") ?? "gemini-3.8-live",
  liveVoice: get("RYU_LIVE_VOICE") ?? "Charon",
};

// The Google AI SDK provider reads GOOGLE_GENERATIVE_AI_API_KEY; the LiveKit
// plugin reads GOOGLE_API_KEY. Accept either name and set both.
if (env.googleKey) {
  // Assign, don't ??=: the AI SDK reads GOOGLE_GENERATIVE_AI_API_KEY, and a
  // stale one in the system env must not silently differ from the key we report.
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = env.googleKey;
  process.env.GOOGLE_API_KEY = env.googleKey;
}

export type Capability = "voice" | "liveStt" | "finalStt" | "brain";

export function providers() {
  return {
    brain: env.googleKey ? `google:${env.llmModel}` : null,
    liveStt: env.groqKey ? "groq:whisper-large-v3-turbo" : env.googleKey ? `google:${env.llmLiteModel}` : null,
    finalStt: env.assemblyKey ? "assemblyai:universal (diarized)" : env.googleKey ? `google:${env.llmModel} (diarized)` : null,
    voice:
      env.googleKey && env.livekitUrl && env.livekitKey && env.livekitSecret
        ? `livekit + google:${env.liveModel}`
        : null,
  } satisfies Record<Capability, string | null>;
}
