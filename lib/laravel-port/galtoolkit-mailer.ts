import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP mailer for the Galtoolkit contact form (port of Laravel
 * `App\Mail\sendContactForm`). Credentials come from the same `MAIL_*` env vars
 * that the Laravel side already uses — no new secrets required.
 */

let cachedTransporter: Transporter | null = null;

interface MailerConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromAddress: string;
    fromName: string;
    contactFormEmail: string;
}

function stripQuotes(value: string | undefined): string | undefined {
    if (value == null) return undefined;
    const t = value.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
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
    const fromName = stripQuotes(process.env.MAIL_FROM_NAME) ?? process.env.APP_NAME ?? "MotionFlow";
    const contactFormEmail = stripQuotes(process.env.CONTACT_FORM_EMAIL);

    if (!host || !user || !pass || !fromAddress || !contactFormEmail) {
        throw new Error(
            "[galtoolkit-mailer] Missing MAIL_HOST/MAIL_USERNAME/MAIL_PASSWORD/MAIL_FROM_ADDRESS/CONTACT_FORM_EMAIL env vars",
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
        contactFormEmail,
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

function renderHtml({
    name,
    email,
    contactMessage,
}: {
    name: string;
    email: string;
    contactMessage: string;
}): string {
    /*
     * Mirrors the Laravel markdown template at
     * `resources/views/emails/contactForm.blade.php`. Plain HTML keeps us off
     * the Laravel mail-component renderer.
     */
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

/** Port of `Mail::send(new sendContactForm($name, $email, $message))`. */
export async function sendGaltoolkitContactForm(payload: ContactFormPayload): Promise<void> {
    const config = readConfig();
    const transporter = getTransporter(config);

    await transporter.sendMail({
        from: { name: config.fromName, address: config.fromAddress },
        to: config.contactFormEmail,
        replyTo: { name: payload.name, address: payload.email },
        subject: "Contact Form",
        text: renderText(payload),
        html: renderHtml(payload),
    });
}
