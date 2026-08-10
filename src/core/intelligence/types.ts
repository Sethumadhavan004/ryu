// Normalized LLM interface — the agent core never sees a provider SDK.

export type Lane = "conversation" | "tools" | "batch";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Present on assistant messages that requested tool calls. */
  toolCalls?: ToolCall[];
  /** Present on tool messages: which call this result answers. */
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  lane: Lane;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  maxTokens?: number;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  /** Which provider/key actually served this — for telemetry. */
  servedBy: { provider: string; model: string; keyId: string };
}

export interface LLMProvider {
  readonly name: string;
  chat(
    request: ChatRequest,
    model: string,
    apiKey: string,
    onToken?: (token: string) => void,
  ): Promise<ChatResponse>;
}

/** Hard limits for one (provider, model) pair, from the provider's official docs. */
export interface RateLimits {
  rpm?: number;
  rpd?: number;
  tpm?: number;
  tpd?: number;
  /** Tokens per month (e.g. Mistral's monthly cap). */
  tpmonth?: number;
}

export interface ProviderModelConfig {
  provider: string;
  /** Exact model id — must be verified against sourceUrl before going live. */
  model: string;
  lanes: Lane[];
  /** Priority within a lane; lower = tried first. */
  priority: number;
  limits: RateLimits;
  /** Official documentation page these limits were read from. */
  sourceUrl: string;
  /** ISO date the limits were last verified against sourceUrl. */
  verifiedAt: string;
  /** Env var names holding the API key(s); multiple = key rotation pool. */
  apiKeyEnvVars: string[];
  enabled: boolean;
}
