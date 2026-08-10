"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SessionState = "disconnected" | "connecting" | "idle" | "listening" | "thinking" | "speaking";

interface LogEntry {
  who: "you" | "ryu" | "system";
  text: string;
}

export default function Home() {
  const [state, setState] = useState<SessionState>("disconnected");
  const [holding, setHolding] = useState(false);
  const [mode, setMode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<{ mode: string; secondsLeft: number } | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const holdingRef = useRef(false);
  const playQueueRef = useRef<string[]>([]);
  const playingRef = useRef<HTMLAudioElement | null>(null);
  const agentLineRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const appendLog = useCallback((who: LogEntry["who"], text: string) => {
    setLog((prev) => {
      // Merge consecutive RYU tokens into one line.
      if (who === "ryu" && agentLineRef.current && prev.length > 0 && prev[prev.length - 1].who === "ryu") {
        const merged = [...prev];
        merged[merged.length - 1] = { who, text: merged[merged.length - 1].text + text };
        return merged;
      }
      agentLineRef.current = who === "ryu";
      return [...prev, { who, text }];
    });
  }, []);

  const stopPlayback = useCallback(() => {
    playQueueRef.current = [];
    playingRef.current?.pause();
    playingRef.current = null;
  }, []);

  const playNext = useCallback(() => {
    const next = playQueueRef.current.shift();
    if (!next) {
      playingRef.current = null;
      return;
    }
    const audio = new Audio(next);
    playingRef.current = audio;
    audio.onended = playNext;
    audio.onerror = playNext;
    void audio.play();
  }, []);

  const setupMic = useCallback(async (ws: WebSocket) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (event) => {
      if (!holdingRef.current || ws.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const sample = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      const bytes = new Uint8Array(pcm.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      ws.send(JSON.stringify({ type: "audio-chunk", audioBase64: btoa(binary) }));
    };
    source.connect(processor);
    processor.connect(ctx.destination);
  }, []);

  const connect = useCallback(() => {
    // WebSocket first so the session (and UI feedback) starts immediately;
    // mic permission is requested after and reported if it fails.
    setState("connecting");
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setupMic(ws).catch((error: unknown) => {
        appendLog("system", `Microphone unavailable: ${error instanceof Error ? error.message : String(error)}`);
      });
    };
    ws.onerror = () => appendLog("system", "WebSocket connection failed — is the server running?");

    ws.onmessage = (message) => {
      const event = JSON.parse(message.data as string) as
        | { type: "state"; state: Exclude<SessionState, "disconnected"> }
        | { type: "transcript"; chunk: { text: string; isFinal: boolean } }
        | { type: "agent-text"; text: string }
        | { type: "agent-audio"; audioBase64: string; mimeType: string }
        | { type: "mode-countdown"; mode: string; secondsLeft: number }
        | { type: "mode-changed"; mode: string | null }
        | { type: "error"; message: string };
      switch (event.type) {
        case "state":
          setState(event.state);
          break;
        case "transcript":
          if (event.chunk.isFinal) appendLog("you", event.chunk.text);
          break;
        case "agent-text":
          appendLog("ryu", event.text);
          break;
        case "agent-audio": {
          playQueueRef.current.push(`data:${event.mimeType};base64,${event.audioBase64}`);
          if (!playingRef.current) playNext();
          break;
        }
        case "mode-countdown":
          setCountdown({ mode: event.mode, secondsLeft: event.secondsLeft });
          break;
        case "mode-changed":
          setCountdown(null);
          setMode(event.mode);
          break;
        case "error":
          appendLog("system", event.message);
          break;
      }
    };
    ws.onclose = () => setState("disconnected");
  }, [appendLog, playNext, setupMic]);

  const disconnect = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "end-session" }));
    wsRef.current?.close();
    processorRef.current?.disconnect();
    void audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    stopPlayback();
    setState("disconnected");
  }, [stopPlayback]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const startHold = () => {
    if (state === "disconnected") return;
    // Talking over RYU = barge-in.
    if (playingRef.current || state === "speaking" || state === "thinking") {
      stopPlayback();
      wsRef.current?.send(JSON.stringify({ type: "barge-in" }));
    }
    holdingRef.current = true;
    setHolding(true);
  };

  const endHold = () => {
    holdingRef.current = false;
    setHolding(false);
    wsRef.current?.send(JSON.stringify({ type: "flush" }));
  };

  const stateLabel: Record<SessionState, string> = {
    disconnected: "Disconnected",
    connecting: "Connecting…",
    idle: "Idle",
    listening: "Listening",
    thinking: "Thinking…",
    speaking: "Speaking",
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-950 p-6 text-zinc-100">
      <div className="flex w-full max-w-2xl flex-1 flex-col gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">RYU</h1>
          <div className="flex items-center gap-3 text-sm">
            {mode && <span className="rounded bg-emerald-900 px-2 py-1">{mode} mode</span>}
            <span className="rounded bg-zinc-800 px-2 py-1">{stateLabel[state]}</span>
          </div>
        </header>

        {countdown && (
          <div className="flex items-center justify-between rounded-lg border border-amber-600 bg-amber-950 px-4 py-3">
            <span>
              Activating <b>{countdown.mode}</b> mode in {countdown.secondsLeft}s…
            </span>
            <button
              className="rounded bg-amber-700 px-3 py-1 hover:bg-amber-600"
              onClick={() => wsRef.current?.send(JSON.stringify({ type: "cancel-mode-activation" }))}
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex-1 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          {log.length === 0 && (
            <p className="text-zinc-500">Connect, then hold the button and speak.</p>
          )}
          {log.map((entry, i) => (
            <p
              key={i}
              className={entry.who === "you" ? "text-sky-300" : entry.who === "ryu" ? "text-zinc-100" : "text-red-400"}
            >
              <span className="mr-2 text-xs uppercase text-zinc-500">{entry.who}</span>
              {entry.text}
            </p>
          ))}
          <div ref={logEndRef} />
        </div>

        <div className="flex items-center justify-center gap-4 pb-2">
          {state === "disconnected" || state === "connecting" ? (
            <button
              className="rounded-full bg-sky-600 px-8 py-4 text-lg font-semibold hover:bg-sky-500 disabled:opacity-60"
              disabled={state === "connecting"}
              onClick={connect}
            >
              {state === "connecting" ? "Connecting…" : "Connect"}
            </button>
          ) : (
            <>
              <button
                className={`select-none rounded-full px-10 py-5 text-lg font-semibold transition-colors ${
                  holding ? "bg-red-600" : "bg-emerald-600 hover:bg-emerald-500"
                }`}
                onPointerDown={startHold}
                onPointerUp={endHold}
                onPointerLeave={() => holding && endHold()}
              >
                {holding ? "Release to send" : "Hold to talk"}
              </button>
              <button className="rounded-full bg-zinc-700 px-5 py-3 hover:bg-zinc-600" onClick={disconnect}>
                End
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
