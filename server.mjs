/**
 * Custom Next.js server with CEP WebSocket upgrade on /api/cep/ws.
 * Production: `node server.mjs` (see package.json start).
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { attachCepWebSocket } from "./server/cep-ws-hub.mjs";
import { deploymentHealth } from "./server/deploy-health.mjs";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT) || 3000;

// NextURL normalizes loopback IPs to localhost. Match that origin so an
// internal rewrite stays internal behind an HTTPS reverse proxy.
const nextHostname = hostname === "127.0.0.1" || hostname === "::1" ? "localhost" : hostname;
const app = next({ dev, hostname: nextHostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer(async (req, res) => {
  try {
    const parsedUrl = parse(req.url, true);
    if (parsedUrl.pathname === "/api/deploy-health") {
      const health = await deploymentHealth();
      res.statusCode = health.status === "ok" ? 200 : 503;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(health));
      return;
    }
    await handle(req, res, parsedUrl);
  } catch (err) {
    console.error("[server] request error", err);
    res.statusCode = 500;
    res.end("internal server error");
  }
});

attachCepWebSocket(server);

server.listen(port, hostname, () => {
  console.log(`[server] ready on http://${hostname}:${port} (dev=${dev})`);
});
