import "server-only";

import { sendResendEmail } from "@/lib/mail/resend-mailer";

/**
 * Galtoolkit contact form (port of Laravel `App\Mail\sendContactForm`).
 * Sends via Resend to `CONTACT_FORM_EMAIL`.
 */

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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml({
  name,
  email,
  contactMessage,
}: {
  name: string;
  email: string;
  contactMessage: string;
}): string {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMsg = escapeHtml(contactMessage).replace(/\r?\n/g, "<br />");
  return `<!doctype html>
<html><body style="font-family: Arial, sans-serif;">
<h1>Contact Form</h1>
<p><strong>From:</strong> ${safeName} (${safeEmail})</p>
<p><strong>Message:</strong></p>
<p>${safeMsg}</p>
</body></html>`;
}

function renderText({
  name,
  email,
  contactMessage,
}: {
  name: string;
  email: string;
  contactMessage: string;
}): string {
  return `Contact Form\n\nFrom: ${name} (${email})\n\nMessage:\n\n${contactMessage}\n`;
}

export interface ContactFormPayload {
  name: string;
  email: string;
  contactMessage: string;
}

export async function sendGaltoolkitContactForm(
  payload: ContactFormPayload,
): Promise<void> {
  const contactFormEmail = stripQuotes(process.env.CONTACT_FORM_EMAIL);
  if (!contactFormEmail) {
    throw new Error("[galtoolkit-mailer] Missing CONTACT_FORM_EMAIL env var");
  }

  await sendResendEmail({
    to: contactFormEmail,
    replyTo: payload.email,
    subject: "Contact Form",
    logPrefix: "[galtoolkit-mail]",
    text: renderText(payload),
    html: renderHtml(payload),
  });
}
