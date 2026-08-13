import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { motionflowSiteOrigin } from "@/lib/motionflow-urls";
import { PASSWORD_RESET_EXPIRE_MINUTES } from "@/lib/auth/password-reset";

let cachedTransporter: Transporter | null = null;

interface MailerConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
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

function readConfig(): MailerConfig {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT ?? 587);
  const encryption = (process.env.MAIL_ENCRYPTION ?? "").toLowerCase();
  const user = stripQuotes(process.env.MAIL_USERNAME);
  const pass = stripQuotes(process.env.MAIL_PASSWORD);
  const fromAddress = stripQuotes(process.env.MAIL_FROM_ADDRESS);
  const fromName =
    stripQuotes(process.env.MAIL_FROM_NAME) ??
    process.env.APP_NAME ??
    "Motion Flow";

  if (!host || !user || !pass || !fromAddress) {
    throw new Error(
      "[password-reset-mailer] Missing MAIL_HOST/MAIL_USERNAME/MAIL_PASSWORD/MAIL_FROM_ADDRESS env vars",
    );
  }

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: encryption === "ssl" || port === 465,
    user,
    pass,
    fromAddress,
    fromName,
  };
}

function getTransporter(config: MailerConfig): Transporter {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  return cachedTransporter;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPasswordResetUrl(
  email: string,
  token: string,
  siteOrigin?: string,
): string {
  const base = (siteOrigin ?? motionflowSiteOrigin()).replace(/\/$/, "");
  const qs = new URLSearchParams({
    email,
    token,
  });
  return `${base}/reset-password?${qs.toString()}`;
}

export async function sendPasswordResetEmail(opts: {
  email: string;
  token: string;
  name?: string | null;
  siteOrigin?: string;
}): Promise<void> {
  const config = readConfig();
  const transporter = getTransporter(config);
  const resetUrl = buildPasswordResetUrl(opts.email, opts.token, opts.siteOrigin);
  const safeName = escapeHtml((opts.name ?? "").trim() || "there");
  const safeUrl = escapeHtml(resetUrl);
  const minutes = PASSWORD_RESET_EXPIRE_MINUTES;

  await transporter.sendMail({
    from: { name: config.fromName, address: config.fromAddress },
    to: opts.email,
    subject: "Reset your Motion Flow password",
    text: `Hi ${opts.name?.trim() || "there"},

We received a request to reset your Motion Flow password.

Open this link to choose a new password (expires in ${minutes} minutes):
${resetUrl}

If you did not request this, you can ignore this email.

— ${config.fromName}`,
    html: `<!doctype html>
<html><body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #111;">
<p>Hi ${safeName},</p>
<p>We received a request to reset your Motion Flow password.</p>
<p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Reset password</a></p>
<p style="word-break:break-all;font-size:13px;color:#555;">Or copy this link:<br />${safeUrl}</p>
<p>This link expires in ${minutes} minutes. If you did not request a reset, you can ignore this email.</p>
<p>— ${escapeHtml(config.fromName)}</p>
</body></html>`,
  });
}

/** For Google-linked accounts: no reset link — point them at Google sign-in. */
export async function sendGoogleAccountPasswordHintEmail(opts: {
  email: string;
  name?: string | null;
  siteOrigin?: string;
}): Promise<void> {
  const config = readConfig();
  const transporter = getTransporter(config);
  const signInUrl = (opts.siteOrigin ?? motionflowSiteOrigin()).replace(/\/$/, "") + "/";
  const safeName = escapeHtml((opts.name ?? "").trim() || "there");
  const safeUrl = escapeHtml(signInUrl);

  await transporter.sendMail({
    from: { name: config.fromName, address: config.fromAddress },
    to: opts.email,
    subject: "Sign in to Motion Flow with Google",
    text: `Hi ${opts.name?.trim() || "there"},

Someone requested a password reset for this email on Motion Flow.

This account is linked to Google. Use “Continue with Google” to sign in instead of a password:
${signInUrl}

If you did not request this, you can ignore this email.

— ${config.fromName}`,
    html: `<!doctype html>
<html><body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #111;">
<p>Hi ${safeName},</p>
<p>Someone requested a password reset for this email on Motion Flow.</p>
<p>This account is linked to Google. Use <strong>Continue with Google</strong> to sign in instead of a password.</p>
<p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Go to Motion Flow</a></p>
<p>If you did not request this, you can ignore this email.</p>
<p>— ${escapeHtml(config.fromName)}</p>
</body></html>`,
  });
}
