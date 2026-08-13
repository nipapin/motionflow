import "server-only";

import { Resend } from "resend";

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

function expandEnvRefs(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => {
    const raw = process.env[key];
    return raw == null ? "" : stripQuotes(raw) ?? "";
  });
}

let cached: Resend | null = null;

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("[resend] Missing RESEND_API_KEY env var");
  }
  if (!cached) cached = new Resend(key);
  return cached;
}

export function mailFromMailbox(): string {
  return stripQuotes(process.env.MAIL_FROM_ADDRESS) || "do-not-reply@motionflow.pro";
}

export function mailFromName(override?: string): string {
  if (override?.trim()) return override.trim();
  return (
    expandEnvRefs(stripQuotes(process.env.MAIL_FROM_NAME)) ||
    expandEnvRefs(process.env.APP_NAME) ||
    "Motion Flow"
  );
}

export function mailFromAddress(fromName?: string): string {
  return `${mailFromName(fromName)} <${mailFromMailbox()}>`;
}

export interface ResendAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  logPrefix?: string;
  fromName?: string;
  replyTo?: string;
  attachments?: ResendAttachment[];
}): Promise<void> {
  const prefix = opts.logPrefix ?? "[resend]";
  const { data, error } = await getResend().emails.send({
    from: mailFromAddress(opts.fromName),
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    ...(opts.attachments?.length
      ? {
          attachments: opts.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
        }
      : {}),
  });

  if (error) {
    console.error(prefix, error);
    throw new Error(`${prefix} ${error.message}`);
  }

  console.log(prefix, { id: data?.id, to: opts.to });
}
