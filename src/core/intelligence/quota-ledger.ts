import type { RateLimits } from "./types";

interface UsageEvent {
  timestamp: number;
  tokens: number;
}

/**
 * Local, in-memory accounting of what each API key has spent, so the router
 * can pick the key with the most headroom instead of draining keys to 429.
 *
 * Deliberately conservative: we only know what WE sent, so real provider-side
 * counters can only be equal or lower. Sliding windows, no persistence for
 * MVP (a restart just makes us more conservative than needed... the reverse —
 * persistence — comes when daily/monthly windows start mattering in practice).
 */
export class QuotaLedger {
  private events = new Map<string, UsageEvent[]>();

  record(keyId: string, tokens: number): void {
    const list = this.events.get(keyId) ?? [];
    list.push({ timestamp: Date.now(), tokens });
    this.events.set(keyId, list);
  }

  /**
   * Fraction of quota remaining for this key, 0..1, taking the tightest of
   * its windows. 1 = untouched, 0 = exhausted on at least one limit.
   */
  headroom(keyId: string, limits: RateLimits): number {
    const now = Date.now();
    const list = this.events.get(keyId) ?? [];
    const windows: Array<[number | undefined, number, (e: UsageEvent) => number]> = [
      [limits.rpm, 60_000, () => 1],
      [limits.rpd, 86_400_000, () => 1],
      [limits.tpm, 60_000, (e) => e.tokens],
      [limits.tpd, 86_400_000, (e) => e.tokens],
      [limits.tpmonth, 30 * 86_400_000, (e) => e.tokens],
    ];
    let min = 1;
    for (const [limit, windowMs, weigh] of windows) {
      if (!limit) continue;
      const used = list
        .filter((e) => now - e.timestamp < windowMs)
        .reduce((sum, e) => sum + weigh(e), 0);
      min = Math.min(min, Math.max(0, 1 - used / limit));
    }
    return min;
  }

  /** Drop events older than the longest window we ever consult. */
  prune(): void {
    const cutoff = Date.now() - 31 * 86_400_000;
    for (const [key, list] of this.events) {
      this.events.set(key, list.filter((e) => e.timestamp >= cutoff));
    }
  }
}
