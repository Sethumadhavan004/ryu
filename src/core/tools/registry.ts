import type { ToolSchema } from "../intelligence/types";

export interface Tool {
  schema: ToolSchema;
  execute(args: Record<string, unknown>): Promise<string>;
}

/**
 * Live set of tools the agent can call. Base tools register at startup;
 * modes add/remove theirs on activation/deactivation.
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.schema.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  schemas(): ToolSchema[] {
    return [...this.tools.values()].map((t) => t.schema);
  }
}
