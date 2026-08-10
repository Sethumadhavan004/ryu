import type { ChatRequest, ChatResponse, LLMProvider, ProviderModelConfig } from "./types";
import { QuotaLedger } from "./quota-ledger";

export interface CallLogEntry {
  timestamp: number;
  lane: string;
  provider: string;
  model: string;
  keyId: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  outcome: "ok" | "rate-limited" | "error";
}

/**
 * Lane-based, headroom-aware routing across the free-tier provider pool.
 *
 * Candidate order within a lane: priority asc, then headroom desc across the
 * entry's key pool. A 429 (or exhausted local headroom) fails over to the
 * next candidate; every attempt is logged for iterative tuning.
 */
export class IntelligenceRouter {
  private ledger = new QuotaLedger();
  private log: CallLogEntry[] = [];
  private implementations = new Map<string, LLMProvider>();

  constructor(private registry: ProviderModelConfig[]) {}

  registerProvider(impl: LLMProvider): void {
    this.implementations.set(impl.name, impl);
  }

  async chat(request: ChatRequest, onToken?: (token: string) => void): Promise<ChatResponse> {
    const candidates = this.candidatesFor(request);
    let lastError: unknown = new Error(`no enabled providers for lane "${request.lane}"`);

    for (const { config, keyId, apiKey } of candidates) {
      const impl = this.implementations.get(config.provider);
      if (!impl) continue;
      const started = Date.now();
      try {
        const response = await impl.chat(request, config.model, apiKey, onToken);
        this.ledger.record(keyId, response.usage.inputTokens + response.usage.outputTokens);
        this.logCall(request, config, keyId, started, response, "ok");
        return response;
      } catch (error) {
        const rateLimited = isRateLimit(error);
        // On 429 the key spent quota we can't see — penalize it locally.
        if (rateLimited) this.ledger.record(keyId, 0);
        this.logCall(request, config, keyId, started, null, rateLimited ? "rate-limited" : "error");
        lastError = error;
      }
    }
    throw lastError;
  }

  /** Enabled (config, key) pairs for the lane, best candidate first. */
  private candidatesFor(request: ChatRequest) {
    return this.registry
      .filter((c) => c.enabled && c.lanes.includes(request.lane))
      .flatMap((config) =>
        config.apiKeyEnvVars
          .map((envVar) => ({ config, keyId: `${config.provider}:${envVar}`, apiKey: process.env[envVar] }))
          .filter((c): c is typeof c & { apiKey: string } => Boolean(c.apiKey)),
      )
      .map((c) => ({ ...c, headroom: this.ledger.headroom(c.keyId, c.config.limits) }))
      .filter((c) => c.headroom > 0)
      .sort((a, b) => a.config.priority - b.config.priority || b.headroom - a.headroom);
  }

  private logCall(
    request: ChatRequest,
    config: ProviderModelConfig,
    keyId: string,
    started: number,
    response: ChatResponse | null,
    outcome: CallLogEntry["outcome"],
  ): void {
    this.log.push({
      timestamp: started,
      lane: request.lane,
      provider: config.provider,
      model: config.model,
      keyId,
      latencyMs: Date.now() - started,
      inputTokens: response?.usage.inputTokens ?? 0,
      outputTokens: response?.usage.outputTokens ?? 0,
      outcome,
    });
  }

  usageLog(): readonly CallLogEntry[] {
    return this.log;
  }
}

function isRateLimit(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 429
  );
}
