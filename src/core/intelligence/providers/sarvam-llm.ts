import { SarvamAIClient } from "sarvamai";
import type {
  ChatRequest,
  ChatResponse,
  LLMProvider,
  ChatMessage,
} from "../types";

type SarvamMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content?: string; tool_calls?: SarvamToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

interface SarvamToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Sarvam chat completions (sarvam-105b, 128K context) as an LLMProvider.
 * OpenAI-shaped API with tool calling, verified against sarvamai SDK v1.1.8.
 *
 * Non-streaming for now: mixing streamed deltas with tool-call assembly adds
 * complexity we don't need for MVP — the sentence-splitter still chunks the
 * finished text to TTS. Revisit when the multi-provider pool lands.
 */
export class SarvamLLMProvider implements LLMProvider {
  readonly name = "sarvam";

  async chat(
    request: ChatRequest,
    model: string,
    apiKey: string,
    onToken?: (token: string) => void,
  ): Promise<ChatResponse> {
    const client = new SarvamAIClient({ apiSubscriptionKey: apiKey });
    const response = await client.chat.completions({
      model: model as "sarvam-105b",
      messages: request.messages.map(toSarvamMessage) as never,
      tools: request.tools?.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      max_tokens: request.maxTokens,
      // Voice replies should be quick and conversational, not deliberative.
      reasoning_effort: "low",
    });

    const choice = response.choices[0];
    const text = choice?.message?.content ?? "";
    const rawToolCalls =
      (choice?.message as { tool_calls?: SarvamToolCall[] })?.tool_calls ?? [];

    if (text && onToken) onToken(text);

    return {
      text,
      toolCalls: rawToolCalls.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: safeParseArgs(call.function.arguments),
      })),
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      servedBy: { provider: this.name, model, keyId: "" },
    };
  }
}

function toSarvamMessage(message: ChatMessage): SarvamMessage {
  switch (message.role) {
    case "assistant":
      return {
        role: "assistant",
        content: message.content || undefined,
        tool_calls: message.toolCalls?.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
    case "tool":
      return { role: "tool", content: message.content, tool_call_id: message.toolCallId ?? "" };
    default:
      return { role: message.role, content: message.content };
  }
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
