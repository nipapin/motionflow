import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;

  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = Number(process.env.REDIS_PORT) || 6379;
  const password = process.env.REDIS_PASSWORD || undefined;
  const db = Number(process.env.REDIS_DB) || 0;

  client = new Redis({
    host,
    port,
    password: password === "null" ? undefined : password,
    db,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
  });

  client.on("error", (err) => {
    console.error("[redis]", err.message);
  });

  return client;
}
