import type { LiveAtom, ProcessEvent, ProcessMeta } from "@ryu/core";
import { fetch as streamingFetch } from "expo/fetch";
import { SERVER_URL } from "../config";
import type { Providers } from "../state/store";

async function json<T>(path: string, init?: RequestInit, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  health: () => json<{ ok: boolean; providers: Providers }>("/api/health", undefined, 4000),

  token: (mode: "boot" | "brief" | "wake", brief?: string) =>
    json<{ url: string; token: string; room: string; identity: string }>("/api/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, brief }),
    }),

  sttChunk: (audio: Blob | Uint8Array, type: string) =>
    json<{ text: string; engine: string }>(
      "/api/stt/chunk",
      { method: "POST", headers: { "content-type": type }, body: audio as BodyInit },
      45_000,
    ),

  liveLedger: (window: string, current: LiveAtom[], hint: string[]) =>
    json<{ atoms: Omit<LiveAtom, "id">[] }>(
      "/api/live-ledger",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ window, current, hint }) },
      45_000,
    ),

  /** Full pipeline. Yields ProcessEvents as the server streams NDJSON lines. */
  async *process(audio: Blob | Uint8Array, type: string, meta: ProcessMeta, signal?: AbortSignal): AsyncGenerator<ProcessEvent> {
    const res = await streamingFetch(`${SERVER_URL}/api/process`, {
      method: "POST",
      headers: { "content-type": type, "x-ryu-meta": encodeURIComponent(JSON.stringify(meta)) },
      body: audio as never,
      signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      let msg = `HTTP ${res.status}`;
      try {
        msg = (JSON.parse(text) as { error?: string }).error ?? msg;
      } catch {}
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) yield JSON.parse(line) as ProcessEvent;
      }
    }
    if (buf.trim()) yield JSON.parse(buf) as ProcessEvent;
  },
};
