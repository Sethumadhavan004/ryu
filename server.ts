import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientEvent } from "./src/core/types";

// Custom server: Next.js handles HTTP, `ws` handles the persistent voice
// session socket at /ws — the one thing serverless API routes can't do.

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev });

async function main() {
  await app.prepare();
  const handle = app.getRequestHandler();
  const server = createServer((req, res) => handle(req, res));

  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket: WebSocket) => {
    // Session wiring lands in the voice-loop phase: construct STT/TTS
    // providers, router, agent core, mode manager, and an orchestrator whose
    // `emit` sends ServerEvents down this socket.
    socket.on("message", (raw) => {
      let event: ClientEvent;
      try {
        event = JSON.parse(raw.toString()) as ClientEvent;
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "malformed event" }));
        return;
      }
      void event; // dispatch to orchestrator once wired
    });
  });

  server.listen(port, () => {
    console.log(`RYU listening on http://localhost:${port} (ws at /ws)`);
  });
}

void main();
