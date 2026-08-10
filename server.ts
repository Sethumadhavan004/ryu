import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientEvent } from "./src/core/types";
import type { SessionOrchestrator } from "./src/core/orchestrator/session";

// Custom server: Next.js handles HTTP, `ws` handles the persistent voice
// session socket at /ws — the one thing serverless API routes can't do.

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev });

async function main() {
  await app.prepare(); // also loads .env into process.env
  const handle = app.getRequestHandler();
  const server = createServer((req, res) => handle(req, res));

  // Imported after app.prepare() so session code sees the loaded env vars.
  const { createSession } = await import("./src/core/session-factory");

  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", async (socket: WebSocket) => {
    const send = (event: unknown) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };

    let session: SessionOrchestrator;
    try {
      session = createSession(send);
      await session.start();
    } catch (error) {
      send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      socket.close();
      return;
    }

    socket.on("message", (raw) => {
      let event: ClientEvent;
      try {
        event = JSON.parse(raw.toString()) as ClientEvent;
      } catch {
        send({ type: "error", message: "malformed event" });
        return;
      }
      switch (event.type) {
        case "audio-chunk":
          session.pushAudio(Buffer.from(event.audioBase64, "base64"));
          break;
        case "flush":
          session.flush();
          break;
        case "barge-in":
          session.bargeIn();
          break;
        case "cancel-mode-activation":
          session.bargeIn();
          break;
        case "end-session":
          void session.stop();
          socket.close();
          break;
      }
    });

    socket.on("close", () => void session.stop());
  });

  server.listen(port, () => {
    console.log(`RYU listening on http://localhost:${port} (ws at /ws)`);
  });
}

void main();
