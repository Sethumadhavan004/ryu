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
