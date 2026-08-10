import { SessionOrchestrator } from "./orchestrator/session";
import { SarvamSTT, SarvamTTS } from "./speech/sarvam";
import { IntelligenceRouter } from "./intelligence/router";
import { PROVIDER_REGISTRY } from "./intelligence/providers.config";
import { SarvamLLMProvider } from "./intelligence/providers/sarvam-llm";
import { AgentCore } from "./agent/agent-core";
import { ToolRegistry } from "./tools/registry";
import { ModeManager } from "./modes/manager";
import { timeTool, calculatorTool, modeTools } from "./tools/base-tools";
import type { ServerEvent } from "./types";

/** Wire up one full RYU session: speech + router + agent + modes. */
export function createSession(emit: (event: ServerEvent) => void): SessionOrchestrator {
  const sarvamKey = process.env.SARVAM_API_KEY_1 ?? process.env.SARVAM_API_KEY_2;
  if (!sarvamKey) throw new Error("SARVAM_API_KEY_1 (or _2) missing from .env");

  const router = new IntelligenceRouter(PROVIDER_REGISTRY);
  router.registerProvider(new SarvamLLMProvider());

  const tools = new ToolRegistry();
  const modes = new ModeManager(tools, emit);
  tools.register(timeTool());
  tools.register(calculatorTool());
  for (const tool of modeTools(modes)) tools.register(tool);

  const agent = new AgentCore(router, tools, modes);
  // Speech uses key 1, chat rotates both keys via the router — spreads the
  // per-key 60 rpm budget.
  return new SessionOrchestrator(new SarvamSTT(sarvamKey), new SarvamTTS(sarvamKey), agent, modes, emit);
}
