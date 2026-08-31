import { motionflowSiteOrigin } from "@/lib/motionflow-urls";
import { mailFromName } from "@/lib/mail/resend-mailer";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export { escapeHtml };

export interface BrandedEmailContent {
  subject: string;
  text: string;
  html: string;
}

interface BrandedEmailInput {
  preheader: string;
  heading: string;
  greetingName?: string | null;
  paragraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
}

/**
 * Dark Motion Flow layout (navy + blue CTA), table-based for mail clients.
 */
export function renderMotionflowEmail(input: BrandedEmailInput): {
  html: string;
  text: string;
} {
  const origin = motionflowSiteOrigin().replace(/\/$/, "");
  const logoUrl = `${origin}/assets/logo_square_white.png`;
  const brand = mailFromName();
  const greeting = input.greetingName?.trim()
    ? `Hi ${input.greetingName.trim()},`
    : "Hi,";
  const safeHeading = escapeHtml(input.heading);
  const safeCta = escapeHtml(input.ctaLabel);
  const safeUrl = escapeHtml(input.ctaUrl);
  const safeFooter = escapeHtml(input.footer);
  const safePreheader = escapeHtml(input.preheader);
  const bodyHtml = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">${escapeHtml(p)}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeHeading}</title>
</head>
<body style="margin:0;padding:0;background:#070b14;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding:0 0 20px;text-align:center;">
              <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brand)}" width="36" height="36" style="display:inline-block;vertical-align:middle;border:0;" />
              <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:18px;font-weight:600;letter-spacing:-0.02em;color:#f1f5f9;">${escapeHtml(brand)}</span>
            </td>
          </tr>
          <tr>
            <td style="background:#0f172a;border:1px solid rgba(59,130,246,0.22);border-radius:16px;padding:32px 28px;">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#f8fafc;font-weight:600;letter-spacing:-0.03em;">${safeHeading}</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">${escapeHtml(greeting)}</p>
              ${bodyHtml}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
                <tr>
                  <td style="border-radius:12px;background:#2563eb;">
                    <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${safeCta}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all;">Or copy this link:<br /><a href="${safeUrl}" style="color:#60a5fa;text-decoration:none;">${safeUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;text-align:center;font-size:12px;line-height:1.5;color:#64748b;">
              ${safeFooter}<br />
              <a href="${escapeHtml(origin)}" style="color:#60a5fa;text-decoration:none;">${escapeHtml(origin.replace(/^https:\/\//, ""))}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${greeting}

${input.heading}

${input.paragraphs.join("\n\n")}

${input.ctaLabel}:
${input.ctaUrl}

${input.footer}

${origin}`;

  return { html, text };
}

export function passwordResetEmail(opts: {
  name?: string | null;
  resetUrl: string;
  expiresMinutes: number;
}): BrandedEmailContent {
  const rendered = renderMotionflowEmail({
    preheader: "Choose a new password for your Motion Flow account.",
    heading: "Reset your password",
    greetingName: opts.name,
    paragraphs: [
      "We received a request to reset the password for your Motion Flow account.",
      `This link expires in ${opts.expiresMinutes} minutes. If you did not ask for a reset, you can ignore this email.`,
    ],
    ctaLabel: "Set new password",
    ctaUrl: opts.resetUrl,
    footer: "If you did not request this, your password stays the same.",
  });
  return {
    subject: "Reset your Motion Flow password",
    ...rendered,
  };
}

export function googlePasswordHintEmail(opts: {
  name?: string | null;
  signInUrl: string;
}): BrandedEmailContent {
  const rendered = renderMotionflowEmail({
    preheader: "This Motion Flow account signs in with Google.",
    heading: "Use Google to sign in",
    greetingName: opts.name,
    paragraphs: [
      "Someone requested a password reset for this email on Motion Flow.",
      "This account is linked to Google. Use Continue with Google instead of a password.",
    ],
    ctaLabel: "Go to Motion Flow",
    ctaUrl: opts.signInUrl,
    footer: "If you did not request this, you can ignore this email.",
  });
  return {
    subject: "Sign in to Motion Flow with Google",
    ...rendered,
  };
}

export function authorAccessInviteEmail(opts: {
  name?: string | null;
  authorLabel: string;
  resetUrl: string;
  expiresDays: number;
}): BrandedEmailContent {
  const author = opts.authorLabel.trim() || "Motion Flow";
  const rendered = renderMotionflowEmail({
    preheader: `You have been given access to ${author}. Set your password to get started.`,
    heading: `Access to ${author}`,
    greetingName: opts.name,
    paragraphs: [
      `An admin opened ${author} access on your Motion Flow account.`,
      "Set a password with the button below, then sign in to download packs or use the extension.",
      `This link expires in ${opts.expiresDays} days.`,
    ],
    ctaLabel: "Set password",
    ctaUrl: opts.resetUrl,
    footer: "If you were not expecting this, you can ignore this email.",
  });
  return {
    subject: `Set your password — ${author} access`,
    ...rendered,
  };
}

export function verifyEmailContent(opts: {
  name?: string | null;
  email: string;
  verifyUrl: string;
  expiresHours: number;
}): BrandedEmailContent {
  const rendered = renderMotionflowEmail({
    preheader: `Confirm ${opts.email} to finish creating your Motion Flow account.`,
    heading: "Confirm your email",
    greetingName: opts.name,
    paragraphs: [
      `Please confirm that ${opts.email} is the right address for this Motion Flow account.`,
      `This link expires in ${opts.expiresHours} hours. If the address looks wrong, register again with the correct email.`,
    ],
    ctaLabel: "Confirm email",
    ctaUrl: opts.verifyUrl,
    footer: "If you did not create this account, you can ignore this email.",
  });
  return {
    subject: "Confirm your Motion Flow email",
    ...rendered,
  };
}
