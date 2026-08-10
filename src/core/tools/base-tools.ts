import type { Tool } from "./registry";
import type { ModeManager } from "../modes/manager";

// Base tools: deliberately non-LLM, deterministic implementations.

export function timeTool(): Tool {
  return {
    schema: {
      name: "get_current_time",
      description: "Get the current date and time.",
      parameters: { type: "object", properties: {} },
    },
    execute: async () =>
      new Date().toLocaleString("en-IN", { dateStyle: "full", timeStyle: "medium" }),
  };
}

export function calculatorTool(): Tool {
  return {
    schema: {
      name: "calculate",
      description: "Evaluate a basic arithmetic expression (+, -, *, /, %, parentheses).",
      parameters: {
        type: "object",
        properties: { expression: { type: "string", description: "e.g. (12.5 * 4) / 2" } },
        required: ["expression"],
      },
    },
    execute: async (args) => {
      const expression = String(args.expression ?? "");
      if (!/^[\d+\-*/%().\s]+$/.test(expression)) return "Invalid expression";
      try {
        const result: unknown = new Function(`"use strict"; return (${expression});`)();
        return typeof result === "number" && Number.isFinite(result)
          ? String(result)
          : "Invalid expression";
      } catch {
        return "Invalid expression";
      }
    },
  };
}

export function modeTools(modes: ModeManager): Tool[] {
  return [
    {
      schema: {
        name: "activate_mode",
        description:
          "Activate a RYU mode (e.g. 'meeting', 'guide') when the user asks for it. Starts a 5-second cancellable countdown.",
        parameters: {
          type: "object",
          properties: { mode: { type: "string", description: "Mode name" } },
          required: ["mode"],
        },
      },
      execute: async (args) => {
        const name = String(args.mode ?? "");
        const activated = await modes.requestActivation(name);
        return activated
          ? `${name} mode is now active.`
          : `Could not activate "${name}" — it doesn't exist, was cancelled, or another mode is active.`;
      },
    },
    {
      schema: {
        name: "deactivate_mode",
        description: "Deactivate the currently active mode and return to the base assistant.",
        parameters: { type: "object", properties: {} },
      },
      execute: async () => {
        await modes.deactivate();
        return "Mode deactivated.";
      },
    },
  ];
}
