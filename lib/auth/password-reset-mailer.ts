import "server-only";

import { motionflowSiteOrigin } from "@/lib/motionflow-urls";
import { PASSWORD_RESET_EXPIRE_MINUTES } from "@/lib/auth/password-reset";
import {
  readSmtpMailerConfig,
  sendSmtpMail,
} from "@/lib/mail/smtp-transport";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local")
  );
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    return isLoopbackHostname(new URL(origin).hostname);
  } catch {
    return true;
  }
}

/**
 * Public Next site for reset links in email.
 * Apex is Next (`motionflow.pro`); Laravel lives on `authors.motionflow.pro` only.
 * Never embed localhost — mail filters often drop those messages.
 */
export function resolvePasswordResetSiteOrigin(siteOrigin?: string): string {
  const configured = motionflowSiteOrigin().replace(/\/$/, "");
  if (!siteOrigin?.trim()) return configured;
  const candidate = siteOrigin.trim().replace(/\/$/, "");
  if (isLoopbackOrigin(candidate)) return configured;
  return candidate;
}

export function buildPasswordResetUrl(
  email: string,
  token: string,
  siteOrigin?: string,
): string {
  const base = resolvePasswordResetSiteOrigin(siteOrigin);
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
  const config = readSmtpMailerConfig();
  const resetUrl = buildPasswordResetUrl(opts.email, opts.token, opts.siteOrigin);
  const safeName = escapeHtml((opts.name ?? "").trim() || "there");
  const safeUrl = escapeHtml(resetUrl);
  const minutes = PASSWORD_RESET_EXPIRE_MINUTES;

  await sendSmtpMail(
    {
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
    },
    "[password-reset-mail]",
  );
}

/** For Google-linked accounts: no reset link — point them at Google sign-in. */
export async function sendGoogleAccountPasswordHintEmail(opts: {
  email: string;
  name?: string | null;
  siteOrigin?: string;
}): Promise<void> {
  const config = readSmtpMailerConfig();
  const signInUrl = `${resolvePasswordResetSiteOrigin(opts.siteOrigin)}/`;
  const safeName = escapeHtml((opts.name ?? "").trim() || "there");
  const safeUrl = escapeHtml(signInUrl);

  await sendSmtpMail(
    {
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
    },
    "[password-reset-google-hint]",
  );
}
