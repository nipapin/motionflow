import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** @returns {"sandbox" | "production"} */
export function configuredSpunkramEnvironment() {
  return process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_ENVIRONMENT?.toLowerCase() === "production"
    ? "production" : "sandbox";
}

export function spunkramUsesDefaultLiveAccount() {
  return configuredSpunkramEnvironment() === "production"
    && process.env.SPUNKRAM_PADDLE_ACCOUNT === "default";
}

function encryptionKey() {
  const key = process.env.SPUNKRAM_PADDLE_CREDENTIALS_KEY ?? "";
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error("SPUNKRAM_PADDLE_CREDENTIALS_KEY must contain 32 hex-encoded bytes");
  }
  return Buffer.from(key, "hex");
}

/** @typedef {{ apiKey: string, clientToken: string, webhookSecret: string }} SpunkramCredentials */
/**
 * @param {"sandbox" | "production"} environment
 * @param {SpunkramCredentials} credentials
 */
export function encryptSpunkramCredentials(environment, credentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(environment));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/**
 * @param {"sandbox" | "production"} environment
 * @param {string} encrypted
 */
function decryptSpunkramCredentials(environment, encrypted) {
  const data = Buffer.from(encrypted, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(environment));
  decipher.setAuthTag(data.subarray(12, 28));
  const plaintext = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
  return /** @type {SpunkramCredentials} */ (JSON.parse(plaintext.toString("utf8")));
}

/**
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").Connection} db
 * @param {"sandbox" | "production"} environment
 */
export async function readSpunkramCredentials(db, environment) {
  try {
    const [rows] = await db.execute(
      "SELECT encrypted_credentials FROM spunkram_paddle_credentials WHERE environment = ?",
      [environment],
    );
    const [row] = /** @type {(import("mysql2/promise").RowDataPacket & { encrypted_credentials: string })[]} */ (rows);
    if (row) return decryptSpunkramCredentials(environment, row.encrypted_credentials);
  } catch (error) {
    if (error?.code !== "ER_NO_SUCH_TABLE") throw error;
  }

  // Allow deployments to import the current credentials before removing old variables.
  if (environment === configuredSpunkramEnvironment()) {
    return {
      apiKey: process.env.SPUNKRAM_PADDLE_API_KEY?.trim() ?? "",
      clientToken: process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_CLIENT_TOKEN?.trim() ?? "",
      webhookSecret: process.env.SPUNKRAM_PADDLE_WEBHOOK_SECRET?.trim() ?? "",
    };
  }
  return { apiKey: "", clientToken: "", webhookSecret: "" };
}
