import {
  ConnectionState,
  createAudioAnalyser,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrack,
  Room,
  RoomEvent,
  type RpcInvocationData,
  Track,
} from "livekit-client";
import { Platform } from "react-native";
import { levels } from "../state/levels";
import { useRyu, type VoiceStatus } from "../state/store";
import { api } from "./api";
import { prepareVoicePlatform } from "./voice-platform";

export type RpcHandlers = Record<string, (payload: Record<string, unknown>) => Promise<string>>;

/**
 * The Converse link (Research 01/04): WebRTC room with the Ryu agent.
 * Everything here maps real connection/agent state onto the UI —
 * the orb only moves when something real happens.
 */
class VoiceLink {
  private room: Room | null = null;
  private cleanups: (() => void)[] = [];
  private lastActivity = Date.now();
  private closing = false;
  private gen = 0;
  private agentWatch: ReturnType<typeof setTimeout> | null = null;

  get connected() {
    return this.room?.state === ConnectionState.Connected;
  }

  markActivity() {
    this.lastActivity = Date.now();
  }
  idleFor() {
    return Date.now() - this.lastActivity;
  }

  async connect(mode: "boot" | "brief" | "wake", handlers: RpcHandlers, brief?: string) {
    const st = useRyu.getState();
    if (this.room) await this.disconnect();
    st.set({ voice: "connecting", voiceError: null });
    // disconnect() bumps gen, so a connect that's still in flight when a
    // meeting starts gives up instead of finishing into a live room.
    const gen = ++this.gen;
    await prepareVoicePlatform();

    const { url, token } = await api.token(mode, brief);
    if (gen !== this.gen) return;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;

    for (const [method, fn] of Object.entries(handlers)) {
      room.registerRpcMethod(method, async (d: RpcInvocationData) => {
        this.markActivity();
        let payload: Record<string, unknown> = {};
        try {
          payload = d.payload ? (JSON.parse(d.payload) as Record<string, unknown>) : {};
        } catch {}
        return fn(payload);
      });
    }

    room.on(RoomEvent.ParticipantAttributesChanged, (_changed, p) => this.onAttributes(p as RemoteParticipant));
    room.on(RoomEvent.ParticipantConnected, (p) => {
      if (p.isAgent) this.agentArrived();
      this.onAttributes(p);
    });
    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      // An agent that leaves on its own has failed (bad key, quota, crash).
      if (p.isAgent && !this.closing) void this.fail("Ryu's voice agent disconnected. Check the agent terminal — usually an invalid GOOGLE_API_KEY or quota.");
    });
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => this.onTrack(track));
    room.on(RoomEvent.Disconnected, () => {
      const s = useRyu.getState();
      if (s.voice !== "dormant" && s.voice !== "off" && s.voice !== "muted") s.set({ voice: "off" });
      this.teardownLevels();
    });

    room.registerTextStreamHandler("lk.transcription", async (reader) => {
      const localTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.trackSid;
      const attrs = reader.info.attributes ?? {};
      const who: "you" | "ryu" = localTrack && attrs["lk.transcribed_track_id"] === localTrack ? "you" : "ryu";
      const id = reader.info.id;
      let text = "";
      for await (const chunk of reader) {
        text += chunk;
        this.markActivity();
        useRyu.getState().caption({ id, who, text, final: false });
      }
      useRyu.getState().caption({ id, who, text, final: true });
    });

    try {
      await room.connect(url, token);
      if (gen !== this.gen) return void (await room.disconnect());
      await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      if (gen !== this.gen) return void (await room.disconnect());
    } catch (e) {
      // Mic denied etc.: don't leave a live room where the agent talks to nobody.
      if (this.room === room) await this.disconnect();
      else await room.disconnect();
      throw e;
    }

    const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
    if (mic && Platform.OS === "web") {
      const a = createAudioAnalyser(mic as never, { cloneTrack: true });
      levels.readers.input = () => Math.min(1, a.calculateVolume() * 1.6);
      this.cleanups.push(() => void a.cleanup());
    }
    const agentHere = [...room.remoteParticipants.values()].some((p) => p.isAgent);
    for (const p of room.remoteParticipants.values()) this.onAttributes(p);
    if (agentHere) this.agentArrived();
    else {
      // Joined the room; the agent is dispatched and should arrive in ~1–3 s.
      useRyu.getState().set({ voice: "connecting" });
      this.agentWatch = setTimeout(() => {
        if (![...(this.room?.remoteParticipants.values() ?? [])].some((p) => p.isAgent))
          void this.fail("No voice agent joined. Is `npm run agent` running (and LiveKit reachable from it)?");
      }, 12_000);
    }
    this.markActivity();
  }

  private agentArrived() {
    if (this.agentWatch) clearTimeout(this.agentWatch);
    this.agentWatch = null;
    const s = useRyu.getState();
    if (s.voice === "connecting") s.set({ voice: "listening" });
  }

  private async fail(message: string) {
    await this.disconnect();
    const s = useRyu.getState();
    s.set({ voice: "error", voiceError: message });
    s.notify({ title: "Voice link lost", body: message, tone: "danger" });
  }

  private onAttributes(p: RemoteParticipant) {
    const state = p.attributes?.["lk.agent.state"];
    if (!state) return;
    const map: Record<string, VoiceStatus> = {
      initializing: "connecting",
      listening: "listening",
      thinking: "thinking",
      speaking: "speaking",
    };
    const v = map[state];
    if (v) {
      const s = useRyu.getState();
      if (s.voice !== "muted") s.set({ voice: v });
      this.markActivity();
    }
  }

  private onTrack(track: RemoteTrack) {
    if (track.kind !== Track.Kind.Audio) return;
    if (Platform.OS === "web") {
      const el = track.attach();
      el.style.display = "none";
      document.body.appendChild(el);
      this.cleanups.push(() => track.detach().forEach((e) => e.remove()));
      const a = createAudioAnalyser(track as RemoteAudioTrack);
      levels.readers.output = () => Math.min(1, a.calculateVolume() * 2.2);
      this.cleanups.push(() => void a.cleanup());
    }
  }

  private teardownLevels() {
    this.cleanups.splice(0).forEach((f) => f());
    levels.readers.input = null;
    levels.readers.output = null;
    levels.input = levels.output = 0;
  }

  /** Resolves once Ryu has finished its current sentence (or after `max`). */
  async waitUntilQuiet(max = 4500) {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 400));
    while (Date.now() - t0 < max) {
      const v = useRyu.getState().voice;
      if (v !== "speaking" && v !== "thinking") break;
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  async setMuted(muted: boolean) {
    if (!this.room) return;
    await this.room.localParticipant.setMicrophoneEnabled(!muted);
    useRyu.getState().set({ voice: muted ? "muted" : "listening" });
  }

  async disconnect() {
    const r = this.room;
    this.room = null;
    this.gen++;
    this.closing = true;
    if (this.agentWatch) clearTimeout(this.agentWatch);
    this.agentWatch = null;
    this.teardownLevels();
    try {
      if (r) await r.disconnect();
    } finally {
      this.closing = false;
    }
  }
}

export const voice = new VoiceLink();
