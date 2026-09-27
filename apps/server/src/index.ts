import { serve } from "@hono/node-server";
import { app } from "./app";
import { env, providers } from "./env";

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`\n  RYU server  →  http://localhost:${info.port}`);
  for (const [slot, p] of Object.entries(providers())) {
    console.log(`  ${slot.padEnd(9)} ${p ?? "— not configured"}`);
  }
  console.log("");
});
