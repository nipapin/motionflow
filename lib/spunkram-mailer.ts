import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

const SPUNKRAM_CONTACT_EMAIL =
    process.env.SPUNKRAM_CONTACT_EMAIL?.trim() || "spunkramhelp@gmail.com";

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
    const fromName = "Spunkram";

    if (!host || !user || !pass || !fromAddress) {
        throw new Error(
            "[spunkram-mailer] Missing MAIL_HOST/MAIL_USERNAME/MAIL_PASSWORD/MAIL_FROM_ADDRESS env vars",
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

export interface SpunkramContactFormPayload {
    name: string;
    email: string;
    message: string;
    attachment?: File | null;
}

export async function sendSpunkramContactForm(
    payload: SpunkramContactFormPayload,
): Promise<void> {
    const config = readConfig();
    const transporter = getTransporter(config);

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

    const sendResult = await transporter.sendMail({
        from: { name: config.fromName, address: config.fromAddress },
        to: SPUNKRAM_CONTACT_EMAIL,
        replyTo: { name: payload.name, address: payload.email },
        subject: `Spunkram contact — ${payload.name}`,
        text: `From: ${payload.name} (${payload.email})\n\n${payload.message}\n`,
        html: `<!doctype html>
<html><body style="font-family: Arial, sans-serif;">
<h1>Spunkram contact form</h1>
<p><strong>From:</strong> ${safeName} (${safeEmail})</p>
<p><strong>Message:</strong></p>
<p>${safeMsg}</p>
</body></html>`,
        attachments,
    });
    console.log("sendResult", sendResult);
}
