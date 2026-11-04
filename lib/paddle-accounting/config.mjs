import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** @typedef {"sandbox" | "production"} PaddleEnvironment */
/** @typedef {import("mysql2/promise").Pool | import("mysql2/promise").Connection} Database */
/** @typedef {{ bridgeSecret: string, defaultWebhookSecret: string, spunkramWebhookSecret: string }} AccountingSecrets */

/** @param {string | undefined} value @returns {PaddleEnvironment | undefined} */
function parseEnvironment(value) {
  const environment = value?.trim().toLowerCase();
  if (environment === "sandbox" || environment === "production") return environment;
}

function encryptionKey() {
  const appKey = Buffer.from((process.env.APP_KEY ?? "").replace(/^base64:/, ""), "base64");
  if (appKey.length !== 32) throw new Error("A valid APP_KEY is required for Paddle accounting configuration");
  return Buffer.from(hkdfSync("sha256", appKey, "", "motionflow/next/paddle-accounting/v1", 32));
}

/** @param {Database} db @param {boolean} includeSecrets */
async function readConfig(db, includeSecrets) {
  try {
    const [rows] = await db.execute(includeSecrets
      ? "SELECT environment, encrypted_secrets FROM paddle_accounting_config WHERE id = 1"
      : "SELECT environment FROM paddle_accounting_config WHERE id = 1");
    return /** @type {(import("mysql2/promise").RowDataPacket & { environment: PaddleEnvironment, encrypted_secrets?: string })[]} */ (rows)[0];
  } catch (error) {
    if (error?.code !== "ER_NO_SUCH_TABLE") throw error;
  }
}

/** @param {Database} [db] */
export async function readDefaultPaddleEnvironment(db) {
  const row = db && await readConfig(db, false);
  return row?.environment ?? parseEnvironment(process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT);
}

/** @param {Database} db */
export async function readAccountingBridgeConfig(db) {
  const row = await readConfig(db, true);
  if (!row) {
    return {
      environment: parseEnvironment(process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT),
      bridgeSecret: process.env.PADDLE_ACCOUNTING_BRIDGE_SECRET,
      defaultWebhookSecret: process.env.PADDLE_ACCOUNTING_DEFAULT_WEBHOOK_SECRET,
      spunkramWebhookSecret: process.env.PADDLE_ACCOUNTING_SPUNKRAM_WEBHOOK_SECRET,
    };
  }
  const data = Buffer.from(row.encrypted_secrets, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(row.environment));
  decipher.setAuthTag(data.subarray(12, 28));
  const plaintext = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
  const secrets = /** @type {AccountingSecrets} */ (JSON.parse(plaintext.toString("utf8")));
  return { ...secrets, environment: row.environment };
}

/** @param {Database} db @param {string | undefined} configuredEnvironment @param {AccountingSecrets} secrets */
export async function writePaddleAccountingConfig(db, configuredEnvironment, secrets) {
  const environment = parseEnvironment(configuredEnvironment);
  if (!environment || typeof secrets.bridgeSecret !== "string" || secrets.bridgeSecret.length < 32) {
    throw new Error("A valid Paddle environment and bridge secret are required");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(environment));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(secrets), "utf8"), cipher.final()]);
  const encrypted = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
  await db.execute(
    `INSERT INTO paddle_accounting_config (id, environment, encrypted_secrets) VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE environment = ?, encrypted_secrets = ?`,
    [environment, encrypted, environment, encrypted],
  );
}
