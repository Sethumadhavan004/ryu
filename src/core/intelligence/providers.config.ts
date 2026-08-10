import type { ProviderModelConfig } from "./types";

/**
 * The provider registry. LIMITS ARE DATA, NOT CODE.
 *
 * Rules for this file:
 *  - Every entry's `limits`, `model` id, and `sourceUrl` must be verified
 *    against the provider's OFFICIAL docs (not blog posts) before setting
 *    `enabled: true`. Stamp `verifiedAt` when you do.
 *  - Never hardcode a model id anywhere else in the codebase.
 *
 * All entries start disabled: ids/limits below are unverified placeholders
 * to be confirmed one by one as each provider is wired in.
 */
export const PROVIDER_REGISTRY: ProviderModelConfig[] = [
  {
    // Interim intelligence until the free-tier pool is set up: shares the
    // Sarvam speech credits. Model id verified from official sarvamai SDK
    // v1.1.8 (SarvamModelIds); rpm from docs (60/min general endpoints).
    provider: "sarvam",
    model: "sarvam-105b",
    lanes: ["conversation", "tools", "batch"],
    priority: 50,
    limits: { rpm: 60 },
    sourceUrl: "https://docs.sarvam.ai/api-reference-docs/ratelimits",
    verifiedAt: "2026-08-11",
    apiKeyEnvVars: ["SARVAM_API_KEY_1", "SARVAM_API_KEY_2"],
    enabled: true,
  },
  {
    provider: "groq",
    model: "UNVERIFIED-llama-3.3-70b-versatile",
    lanes: ["conversation"],
    priority: 1,
    limits: { rpm: 30, rpd: 1000 },
    sourceUrl: "https://console.groq.com/docs/rate-limits",
    verifiedAt: "",
    apiKeyEnvVars: ["GROQ_API_KEY"],
    enabled: false,
  },
  {
    provider: "cerebras",
    model: "UNVERIFIED",
    lanes: ["conversation", "batch"],
    priority: 2,
    limits: { tpd: 1_000_000 },
    sourceUrl: "https://inference-docs.cerebras.ai/support/rate-limits",
    verifiedAt: "",
    apiKeyEnvVars: ["CEREBRAS_API_KEY"],
    enabled: false,
  },
  {
    provider: "gemini",
    model: "UNVERIFIED-gemini-flash",
    lanes: ["tools"],
    priority: 1,
    limits: { rpm: 10, rpd: 250 },
    sourceUrl: "https://ai.google.dev/gemini-api/docs/rate-limits",
    verifiedAt: "",
    // One env var per Google account/project — quota multiplies per key.
    apiKeyEnvVars: ["GEMINI_API_KEY_1", "GEMINI_API_KEY_2"],
    enabled: false,
  },
  {
    provider: "cohere",
    model: "UNVERIFIED",
    lanes: ["tools"],
    priority: 2,
    limits: {},
    sourceUrl: "https://docs.cohere.com/docs/rate-limits",
    verifiedAt: "",
    apiKeyEnvVars: ["COHERE_API_KEY"],
    enabled: false,
  },
  {
    provider: "mistral",
    model: "UNVERIFIED",
    lanes: ["batch"],
    priority: 1,
    limits: { tpmonth: 1_000_000_000 },
    sourceUrl: "https://docs.mistral.ai/deployment/laplateforme/tier/",
    verifiedAt: "",
    apiKeyEnvVars: ["MISTRAL_API_KEY"],
    enabled: false,
  },
  {
    provider: "openrouter",
    model: "UNVERIFIED",
    lanes: ["conversation", "tools", "batch"],
    priority: 99, // catch-all floor for every lane
    limits: { rpm: 20 },
    sourceUrl: "https://openrouter.ai/docs/api-reference/limits",
    verifiedAt: "",
    apiKeyEnvVars: ["OPENROUTER_API_KEY"],
    enabled: false,
  },
];
