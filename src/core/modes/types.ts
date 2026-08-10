import type { Tool } from "../tools/registry";
import type { Utterance } from "../types";

/**
 * A mode is a plug-in on top of the base agent: extra tools, a system-prompt
 * overlay, and lifecycle hooks. Meeting mode hangs its logging on
 * `onUtterance`; guide mode loads its location dataset in `onActivate`.
 */
export interface ModeManifest {
  name: string;
  /** Appended to the base system prompt while the mode is active. */
  systemPromptOverlay: string;
  tools: Tool[];
  onActivate?(): Promise<void>;
  /** Called for every finalized user utterance while active. */
  onUtterance?(utterance: Utterance): Promise<void>;
  onDeactivate?(): Promise<void>;
}
