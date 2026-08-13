import "server-only";

import nodemailer, { type Transporter, type SentMessageInfo } from "nodemailer";

export interface SmtpMailerConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
  /** Hostname announced in SMTP EHLO (must be a real domain, not the OS hostname). */
  ehloName: string;
}

function stripQuotes(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/** Expand Laravel-style `${VAR}` refs (Next dotenv does not). */
export function expandEnvRefs(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => {
    const raw = process.env[key];
    return raw == null ? "" : stripQuotes(raw) ?? "";
  });
}

export function readSmtpMailerConfig(): SmtpMailerConfig {
  const host = process.env.MAIL_HOST?.trim();
  const port = Number(process.env.MAIL_PORT ?? 587);
  const encryption = (process.env.MAIL_ENCRYPTION ?? "").toLowerCase();
  const user = stripQuotes(process.env.MAIL_USERNAME);
  const pass = stripQuotes(process.env.MAIL_PASSWORD);
  const fromAddress = stripQuotes(process.env.MAIL_FROM_ADDRESS);
  const fromName =
    expandEnvRefs(stripQuotes(process.env.MAIL_FROM_NAME)) ||
    expandEnvRefs(process.env.APP_NAME) ||
    "Motion Flow";

  if (!host || !user || !pass || !fromAddress) {
    throw new Error(
      "[smtp-transport] Missing MAIL_HOST/MAIL_USERNAME/MAIL_PASSWORD/MAIL_FROM_ADDRESS env vars",
    );
  }

  const ehloFromHost = host.replace(/^mail\./i, "") || host;

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: encryption === "ssl" || port === 465,
    user,
    pass,
    fromAddress,
    fromName,
    ehloName: ehloFromHost,
  };
}

let cached: { key: string; transporter: Transporter } | null = null;

function configKey(config: SmtpMailerConfig): string {
  return [
    config.host,
    config.port,
    config.secure ? "1" : "0",
    config.user,
    config.ehloName,
  ].join("|");
}

export function getSmtpTransporter(config: SmtpMailerConfig): Transporter {
  const key = configKey(config);
  if (cached?.key === key) return cached.transporter;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    name: config.ehloName,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });

  cached = { key, transporter };
  return transporter;
}

export function resetSmtpTransporterCache(): void {
  cached = null;
}

export async function sendSmtpMail(
  options: Parameters<Transporter["sendMail"]>[0],
  logPrefix = "[smtp]",
): Promise<SentMessageInfo> {
  const config = readSmtpMailerConfig();
  const transporter = getSmtpTransporter(config);

  try {
    const info = await transporter.sendMail({
      ...options,
      from:
        options.from ??
        ({ name: config.fromName, address: config.fromAddress } as const),
    });

    const accepted = info.accepted ?? [];
    const rejected = info.rejected ?? [];
    console.log(logPrefix, {
      messageId: info.messageId,
      accepted,
      rejected,
      response: info.response,
      envelope: info.envelope,
    });

    if (rejected.length > 0) {
      resetSmtpTransporterCache();
      throw new Error(
        `${logPrefix} SMTP rejected recipient(s): ${rejected.join(", ")}`,
      );
    }
    if (accepted.length === 0) {
      resetSmtpTransporterCache();
      throw new Error(`${logPrefix} SMTP accepted no recipients`);
    }

    return info;
  } catch (err) {
    resetSmtpTransporterCache();
    throw err;
  }
}
