import { Platform } from "react-native";

/**
 * Where the Ryu server lives. On a phone, localhost is the phone itself —
 * set EXPO_PUBLIC_RYU_SERVER_URL to your computer's LAN address.
 */
export const SERVER_URL = (process.env.EXPO_PUBLIC_RYU_SERVER_URL ?? "http://localhost:8787").replace(/\/$/, "");

/** Demo mode: the whole flow with scripted data, no keys or server needed. */
export function demoRequested(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("demo");
}

export const IDLE_SLEEP_MS = 3 * 60_000; // Research 04 §A5
export const LIVE_CHUNK_SEC = 30; // Research 02 §2a
export const LIVE_LEDGER_EVERY_MS = 90_000; // Research 04 §B4
