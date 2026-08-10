import type { ChatMessage } from "../intelligence/types";
import type { IntelligenceRouter } from "../intelligence/router";
import type { ToolRegistry } from "../tools/registry";
import type { ModeManager } from "../modes/manager";

const MAX_TOOL_ROUNDS = 8;

const BASE_SYSTEM_PROMPT = `You are RYU, a voice assistant. Your replies are spoken aloud:
keep them short, natural, and free of markdown, lists, or symbols.
Call tools whenever they get a better answer than your own knowledge.
When several tool calls are needed, request them all at once, in parallel.`;

/**
 * The agentic loop: transcript in -> context assembly -> LLM (with current
 * tool schemas) -> execute tool calls in parallel -> repeat until the model
 * produces a spoken answer. Tokens stream out via `onToken` so TTS can start
 * on the first sentence.
 */
export class AgentCore {
  private history: ChatMessage[] = [];

  constructor(
    private router: IntelligenceRouter,
    private tools: ToolRegistry,
    private modes: ModeManager,
  ) {}

  async respond(userText: string, onToken: (token: string) => void): Promise<string> {
    this.history.push({ role: "user", content: userText });
    const messages: ChatMessage[] = [
      { role: "system", content: this.systemPrompt() },
      ...this.history,
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const hasTools = this.tools.schemas().length > 0;
      const response = await this.router.chat(
        {
          lane: hasTools ? "tools" : "conversation",
          messages,
          tools: hasTools ? this.tools.schemas() : undefined,
        },
        onToken,
      );

      if (response.toolCalls.length === 0) {
        this.history.push({ role: "assistant", content: response.text });
        return response.text;
      }

      messages.push({ role: "assistant", content: response.text, toolCalls: response.toolCalls });
      // All tool calls from one turn run in parallel — 20 tool calls should
      // cost ~3-5 LLM round-trips, not 20.
      const results = await Promise.all(
        response.toolCalls.map(async (call) => ({
          call,
          result: await this.executeTool(call.name, call.arguments),
        })),
      );
      for (const { call, result } of results) {
        messages.push({ role: "tool", content: result, toolCallId: call.id });
      }
    }
    return "I hit my tool budget for this request. Could you narrow it down?";
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) return `Unknown tool: ${name}`;
    try {
      return await tool.execute(args);
    } catch (error) {
      return `Tool ${name} failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private systemPrompt(): string {
    const overlay = this.modes.activeMode()?.systemPromptOverlay;
    return overlay ? `${BASE_SYSTEM_PROMPT}\n\n${overlay}` : BASE_SYSTEM_PROMPT;
  }
}
