/**
 * Custom Next.js server with CEP WebSocket upgrade on /api/cep/ws.
 * Production: `node server.mjs` (see package.json start).
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { attachCepWebSocket } from "./server/cep-ws-hub.mjs";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer(async (req, res) => {
  try {
    const parsedUrl = parse(req.url, true);
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
