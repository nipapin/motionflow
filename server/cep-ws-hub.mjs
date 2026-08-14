/**
 * CEP WebSocket hub — plain Node ESM (used by server.mjs).
 * Auth: first JSON message `{ type: "auth", token: "mfcep_…" }`
 * Subscribe: `{ type: "hello", host: "AE"|"PR" }`
 * Events arrive via Redis `cep:events:{authorId}`.
 */
import { createHash } from "crypto";
import { createPool } from "mysql2/promise";
import Redis from "ioredis";
import { WebSocketServer } from "ws";

const AUTH_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 25000;
const MAX_SOCKETS_PER_USER = 4;

function stripEnvQuotes(value) {
  if (value == null) return undefined;
  const t = String(value).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function makePool() {
  return createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME,
    password: stripEnvQuotes(process.env.DB_PASSWORD),
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 4,
  });
}

function makeRedis() {
  const password = process.env.REDIS_PASSWORD;
  return new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: !password || password === "null" ? undefined : password,
    db: Number(process.env.REDIS_DB) || 0,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
}

/** client → authorId (must stay in sync with lib/cep-client-registry.ts) */
const CLIENT_AUTHOR = {
  "spunkram-cep": Number(process.env.SPUNKRAM_AUTHOR_ID) || 1691,
};

/**
 * @param {import('http').Server} server
 */
export function attachCepWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });
  const pool = makePool();
  const sub = makeRedis();

  /** @type {Map<string, Set<import('ws').WebSocket>>} */
  const rooms = new Map(); // key = `${authorId}:${host}`
  /** @type {WeakMap<import('ws').WebSocket, { userId: number, authorId: number, host: string, deviceId: number }>} */
  const meta = new WeakMap();
  /** @type {Map<number, Set<import('ws').WebSocket>>} */
  const byUser = new Map();

  function roomKey(authorId, host) {
    return `${authorId}:${host}`;
  }

  function addToRoom(ws, authorId, host) {
    const key = roomKey(authorId, host);
    let set = rooms.get(key);
    if (!set) {
      set = new Set();
      rooms.set(key, set);
    }
    set.add(ws);
  }

  function removeSocket(ws) {
    const m = meta.get(ws);
    if (m) {
      const set = rooms.get(roomKey(m.authorId, m.host));
      set?.delete(ws);
      const userSet = byUser.get(m.userId);
      userSet?.delete(ws);
      meta.delete(ws);
    }
  }

  async function resolveToken(token) {
    if (!token || typeof token !== "string" || !token.startsWith("mfcep_")) return null;
    const [rows] = await pool.execute(
      `SELECT d.id AS device_id, u.id AS user_id, u.email, u.name, d.client
       FROM cep_devices d
       JOIN users u ON u.id = d.user_id
       WHERE d.token_hash = ? AND d.revoked_at IS NULL
       LIMIT 1`,
      [hashToken(token)],
    );
    const row = rows[0];
    if (!row) return null;
    void pool
      .execute(`UPDATE cep_devices SET last_seen_at = NOW() WHERE id = ?`, [row.device_id])
      .catch(() => {});
    return {
      id: Number(row.user_id),
      email: row.email,
      name: row.name ?? "",
      deviceId: Number(row.device_id),
      client: String(row.client || "spunkram-cep"),
    };
  }

  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname !== "/api/cep/ws") {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", (ws) => {
    let authed = false;
    ws.__alive = true;
    const authTimer = setTimeout(() => {
      if (!authed) {
        try {
          ws.close(4401, "AUTH_TIMEOUT");
        } catch {
          /* ignore */
        }
      }
    }, AUTH_TIMEOUT_MS);

    ws.on("pong", () => {
      ws.__alive = true;
    });

    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;

      if (!authed) {
        if (msg.type !== "auth" || typeof msg.token !== "string") {
          ws.close(4401, "UNAUTHORIZED");
          return;
        }
        try {
          const user = await resolveToken(msg.token);
          if (!user) {
            ws.close(4401, "UNAUTHORIZED");
            return;
          }
          const authorId = CLIENT_AUTHOR[user.client];
          if (!authorId) {
            ws.close(4403, "UNKNOWN_CLIENT");
            return;
          }
          // Cap sockets per user
          let userSet = byUser.get(user.id);
          if (!userSet) {
            userSet = new Set();
            byUser.set(user.id, userSet);
          }
          while (userSet.size >= MAX_SOCKETS_PER_USER) {
            const oldest = userSet.values().next().value;
            if (!oldest) break;
            try {
              oldest.close(4000, "REPLACED");
            } catch {
              /* ignore */
            }
            removeSocket(oldest);
          }
          userSet.add(ws);
          meta.set(ws, {
            userId: user.id,
            authorId,
            host: "",
            deviceId: user.deviceId,
          });
          authed = true;
          clearTimeout(authTimer);
          ws.send(JSON.stringify({ type: "auth.ok", client: user.client }));
        } catch (err) {
          console.error("[cep-ws] auth failed", err?.message || err);
          ws.close(4500, "AUTH_ERROR");
        }
        return;
      }

      if (msg.type === "hello") {
        const host = String(msg.host || "").toUpperCase() === "PR" ? "PR" : "AE";
        const m = meta.get(ws);
        if (!m) return;
        if (m.host) {
          const prev = rooms.get(roomKey(m.authorId, m.host));
          prev?.delete(ws);
        }
        m.host = host;
        addToRoom(ws, m.authorId, host);
        ws.send(JSON.stringify({ type: "hello.ok", host }));
        return;
      }

      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      removeSocket(ws);
    });

    ws.on("error", () => {
      removeSocket(ws);
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.readyState !== 1) continue;
      if (ws.__alive === false) {
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
        removeSocket(ws);
        continue;
      }
      ws.__alive = false;
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }
  }, HEARTBEAT_MS);

  // Redis fan-in — pack rooms + global extension releases
  void (async () => {
    try {
      await sub.connect();
      await sub.psubscribe("cep:events:*");
      await sub.subscribe("cep:extension");

      const broadcastAll = (frame) => {
        for (const ws of wss.clients) {
          if (ws.readyState !== 1) continue;
          // Only authed sockets that finished hello (in a room) — or any with meta
          if (!meta.get(ws)) continue;
          try {
            ws.send(frame);
          } catch {
            /* ignore */
          }
        }
      };

      sub.on("pmessage", (_pattern, channel, message) => {
        try {
          const event = JSON.parse(message);
          if (!event?.type || !event?.host || !event?.author_id) return;
          const key = roomKey(Number(event.author_id), String(event.host).toUpperCase());
          const set = rooms.get(key);
          if (!set || set.size === 0) return;
          const frame = JSON.stringify(event);
          for (const ws of set) {
            if (ws.readyState === 1) {
              try {
                ws.send(frame);
              } catch {
                /* ignore */
              }
            }
          }
        } catch (err) {
          console.warn("[cep-ws] bad redis message", err?.message || err);
        }
      });

      sub.on("message", (channel, message) => {
        if (channel !== "cep:extension") return;
        try {
          const event = JSON.parse(message);
          if (event?.type !== "extension.update" || !event?.version) return;
          broadcastAll(JSON.stringify(event));
        } catch (err) {
          console.warn("[cep-ws] bad extension message", err?.message || err);
        }
      });

      console.log("[cep-ws] subscribed to cep:events:* and cep:extension");
    } catch (err) {
      console.error("[cep-ws] redis subscribe failed", err?.message || err);
    }
  })();

  const shutdown = () => {
    clearInterval(heartbeat);
    try {
      sub.disconnect();
    } catch {
      /* ignore */
    }
    try {
      void pool.end();
    } catch {
      /* ignore */
    }
    wss.close();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("[cep-ws] attached on /api/cep/ws");
  return { wss, shutdown };
}
