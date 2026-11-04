import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import {
  configuredSpunkramEnvironment,
  encryptSpunkramCredentials,
} from "../lib/paddle-accounting/spunkram-credentials.mjs";

const usage = "Use: node scripts/configure-spunkram-paddle.mjs <sandbox|production> [--from-env]";
const [environment, source, ...extraArgs] = process.argv.slice(2);

async function readInput() {
  if (source === "--from-env") {
    if (environment !== configuredSpunkramEnvironment()) {
      throw new Error("Requested environment does not match the existing Spunkram settings");
    }
    return {
      apiKey: process.env.SPUNKRAM_PADDLE_API_KEY,
      clientToken: process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_CLIENT_TOKEN,
      webhookSecret: process.env.SPUNKRAM_PADDLE_WEBHOOK_SECRET,
    };
  }
  if (process.stdin.isTTY) throw new Error("Supply the credentials as JSON on stdin");
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  try {
    return JSON.parse(input);
  } catch {
    throw new Error("Could not parse the credentials JSON");
  }
}

async function main() {
  if (!["sandbox", "production"].includes(environment) || (source && source !== "--from-env") || extraArgs.length) {
    throw new Error(usage);
  }
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const input = await readInput();
  const apiKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : "";
  const clientToken = typeof input?.clientToken === "string" ? input.clientToken.trim() : "";
  const webhookSecret = typeof input?.webhookSecret === "string" ? input.webhookSecret.trim() : "";
  const sandbox = environment === "sandbox";
  const expectedTokenPrefix = sandbox ? "test_" : "live_";
  const wrongApiKeyPrefix = sandbox ? "pdl_live_" : "pdl_sdbx_";
  if (!apiKey || apiKey.startsWith(wrongApiKeyPrefix) || !clientToken.startsWith(expectedTokenPrefix)) {
    throw new Error("Provide an API key and client-side token for the requested environment");
  }
  const encrypted = encryptSpunkramCredentials(environment, { apiKey, clientToken, webhookSecret });
  const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env;
  if (!DB_HOST || !DB_USERNAME || DB_PASSWORD === undefined || !DB_DATABASE) {
    throw new Error("Database configuration is incomplete");
  }
  const sql = await readFile(new URL("../db/migrations/2026_11_04_spunkram_paddle_credentials.sql", import.meta.url), "utf8");
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT ?? 3306),
    user: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_DATABASE,
  });
  try {
    for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
      await connection.query(statement);
    }
    await connection.execute(
      `INSERT INTO spunkram_paddle_credentials (environment, encrypted_credentials) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE encrypted_credentials = ?`,
      [environment, encrypted, encrypted],
    );
  } finally {
    await connection.end();
  }
  console.log(`Spunkram Paddle credentials saved for ${environment}.`);
}

main().catch((error) => {
  console.error("Could not save Spunkram Paddle credentials.", error.code ?? error.message);
  process.exitCode = 1;
});
