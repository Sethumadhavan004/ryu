import type { ModeManifest } from "./types";
import type { ToolRegistry } from "../tools/registry";
import type { Utterance } from "../types";

const COUNTDOWN_SECONDS = 5;

/**
 * Owns mode activation/deactivation, including the 5-second cancellable
 * countdown. Entirely deterministic — the LLM only *requests* activation via
 * the `activate_mode` base tool; everything after that is harness.
 */
export class ModeManager {
  private available = new Map<string, ModeManifest>();
  private active: ModeManifest | null = null;
  private pendingCancel: (() => void) | null = null;

  constructor(
    private toolRegistry: ToolRegistry,
    private emit: (event: { type: "mode-countdown"; mode: string; secondsLeft: number } | { type: "mode-changed"; mode: string | null }) => void,
  ) {}

  registerMode(mode: ModeManifest): void {
    this.available.set(mode.name, mode);
  }

  activeMode(): ModeManifest | null {
    return this.active;
  }

  /** Cancels an in-flight activation countdown (user said stop / barge-in). */
  cancelPendingActivation(): void {
    this.pendingCancel?.();
  }

  async requestActivation(name: string): Promise<boolean> {
    const mode = this.available.get(name);
    if (!mode || this.active) return false;

    const cancelled = await this.countdown(name);
    if (cancelled) return false;

    for (const tool of mode.tools) this.toolRegistry.register(tool);
    await mode.onActivate?.();
    this.active = mode;
    this.emit({ type: "mode-changed", mode: name });
    return true;
  }

  async deactivate(): Promise<void> {
    if (!this.active) return;
    for (const tool of this.active.tools) this.toolRegistry.unregister(tool.schema.name);
    await this.active.onDeactivate?.();
    this.active = null;
    this.emit({ type: "mode-changed", mode: null });
  }

  async handleUtterance(utterance: Utterance): Promise<void> {
    await this.active?.onUtterance?.(utterance);
  }

  /** Resolves true if the user cancelled before the countdown finished. */
  private countdown(mode: string): Promise<boolean> {
    return new Promise((resolve) => {
      let secondsLeft = COUNTDOWN_SECONDS;
      const tick = setInterval(() => {
        this.emit({ type: "mode-countdown", mode, secondsLeft });
        secondsLeft -= 1;
        if (secondsLeft < 0) {
          clearInterval(tick);
          this.pendingCancel = null;
          resolve(false);
        }
      }, 1000);
      this.pendingCancel = () => {
        clearInterval(tick);
        this.pendingCancel = null;
        resolve(true);
      };
    });
  }
}
