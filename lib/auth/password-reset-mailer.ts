import "server-only";

import { sendResendEmail } from "@/lib/mail/resend-mailer";
import { resolveMailSiteOrigin } from "@/lib/mail/public-origin";
import {
  authorAccessInviteEmail,
  googlePasswordHintEmail,
  passwordResetEmail,
  verifyEmailContent,
} from "@/lib/mail/templates";
import {
  PASSWORD_INVITE_EXPIRE_MINUTES,
  PASSWORD_RESET_EXPIRE_MINUTES,
} from "@/lib/auth/password-reset";
import { EMAIL_VERIFY_EXPIRE_HOURS } from "@/lib/auth/email-verification";

export function buildPasswordResetUrl(
  email: string,
  token: string,
  siteOrigin?: string,
  opts?: { invite?: boolean },
): string {
  const base = resolveMailSiteOrigin(siteOrigin);
  const qs = new URLSearchParams({ email, token });
  if (opts?.invite) qs.set("source", "invite");
  return `${base}/reset-password?${qs.toString()}`;
}

export function buildVerifyEmailUrl(
  email: string,
  token: string,
  siteOrigin?: string,
): string {
  const base = resolveMailSiteOrigin(siteOrigin);
  const qs = new URLSearchParams({ email, token });
  return `${base}/verify-email?${qs.toString()}`;
}

export async function sendPasswordResetEmail(opts: {
  email: string;
  token: string;
  name?: string | null;
  siteOrigin?: string;
}): Promise<void> {
  const resetUrl = buildPasswordResetUrl(opts.email, opts.token, opts.siteOrigin);
  const content = passwordResetEmail({
    name: opts.name,
    resetUrl,
    expiresMinutes: PASSWORD_RESET_EXPIRE_MINUTES,
  });
  await sendResendEmail({
    to: opts.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    logPrefix: "[password-reset-mail]",
  });
}

export async function sendGoogleAccountPasswordHintEmail(opts: {
  email: string;
  name?: string | null;
  siteOrigin?: string;
}): Promise<void> {
  const signInUrl = `${resolveMailSiteOrigin(opts.siteOrigin)}/`;
  const content = googlePasswordHintEmail({
    name: opts.name,
    signInUrl,
  });
  await sendResendEmail({
    to: opts.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    logPrefix: "[password-reset-google-hint]",
  });
}

export async function sendAuthorAccessInviteEmail(opts: {
  email: string;
  token: string;
  name?: string | null;
  authorLabel: string;
  siteOrigin?: string;
}): Promise<void> {
  const resetUrl = buildPasswordResetUrl(opts.email, opts.token, opts.siteOrigin, {
    invite: true,
  });
  const expiresDays = Math.round(PASSWORD_INVITE_EXPIRE_MINUTES / (60 * 24));
  const content = authorAccessInviteEmail({
    name: opts.name,
    authorLabel: opts.authorLabel,
    resetUrl,
    expiresDays,
  });
  await sendResendEmail({
    to: opts.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    logPrefix: "[author-access-invite-mail]",
  });
}

export async function sendVerifyEmail(opts: {
  email: string;
  token: string;
  name?: string | null;
  siteOrigin?: string;
}): Promise<void> {
  const verifyUrl = buildVerifyEmailUrl(opts.email, opts.token, opts.siteOrigin);
  const content = verifyEmailContent({
    name: opts.name,
    email: opts.email,
    verifyUrl,
    expiresHours: EMAIL_VERIFY_EXPIRE_HOURS,
  });
  await sendResendEmail({
    to: opts.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
    logPrefix: "[verify-email-mail]",
  });
}
