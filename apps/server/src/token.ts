import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";
import { env } from "./env";

export interface AgentJobMeta {
  /** "boot": first open (short greeting). "brief": notes just finished. "wake": resume after sleep/meeting. */
  mode: "boot" | "brief" | "wake";
  brief?: string;
}

/**
 * A fresh room per Converse session, with the Ryu agent explicitly
 * dispatched into it. The agent learns why it was summoned from `metadata`.
 */
export async function issueToken(meta: AgentJobMeta) {
  if (!env.livekitUrl || !env.livekitKey || !env.livekitSecret) {
    throw new Error("LiveKit is not configured (LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET).");
  }
  const room = `ryu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const identity = `user-${Math.random().toString(36).slice(2, 9)}`;
  const at = new AccessToken(env.livekitKey, env.livekitSecret, { identity, name: "You", ttl: "2h" });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: env.agentName, metadata: JSON.stringify(meta) })],
  });
  return { url: env.livekitUrl, token: await at.toJwt(), room, identity };
}
