import "server-only";

import { sendResendEmail } from "@/lib/mail/resend-mailer";

const SPUNKRAM_CONTACT_EMAIL =
  process.env.SPUNKRAM_CONTACT_EMAIL?.trim() || "spunkramhelp@gmail.com";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SpunkramContactFormPayload {
  name: string;
  email: string;
  message: string;
  attachment?: File | null;
}

export async function sendSpunkramContactForm(
  payload: SpunkramContactFormPayload,
): Promise<void> {
  const safeName = escapeHtml(payload.name);
  const safeEmail = escapeHtml(payload.email);
  const safeMsg = escapeHtml(payload.message).replace(/\r?\n/g, "<br />");

  const attachments = [];
  if (payload.attachment && payload.attachment.size > 0) {
    attachments.push({
      filename: payload.attachment.name || "attachment",
      content: Buffer.from(await payload.attachment.arrayBuffer()),
      contentType: payload.attachment.type || undefined,
    });
  }

  await sendResendEmail({
    fromName: "Spunkram",
    to: SPUNKRAM_CONTACT_EMAIL,
    replyTo: payload.email,
    subject: `Spunkram contact — ${payload.name}`,
    logPrefix: "[spunkram-mail]",
    text: `From: ${payload.name} (${payload.email})\n\n${payload.message}\n`,
    html: `<!doctype html>
<html><body style="font-family: Arial, sans-serif;">
<h1>Spunkram contact form</h1>
<p><strong>From:</strong> ${safeName} (${safeEmail})</p>
<p><strong>Message:</strong></p>
<p>${safeMsg}</p>
</body></html>`,
    attachments: attachments.length ? attachments : undefined,
  });
}
