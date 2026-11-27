import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import { sendSpunkramContactForm } from "@/lib/spunkram-mailer";
import { sendGaltoolkitContactForm } from "@/lib/laravel-port/galtoolkit-mailer";
import type { ResendAttachment } from "@/lib/mail/resend-mailer";

type SupportRoute = "spunkram-cep" | "gal-cep" | "gal-screenshots";
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;
const MAX_SCREENSHOT_BASE64_BYTES = 4 * Math.ceil(MAX_SCREENSHOT_BYTES / 3);
const MAX_CONTACT_BYTES = 64 * 1024;
const screenshotFormats = {
  "image/png": { extension: "png", signature: Buffer.from("89504e470d0a1a0a", "hex") },
  "image/jpeg": { extension: "jpg", signature: Buffer.from("ffd8ff", "hex") },
  "image/webp": { extension: "webp", signature: Buffer.from("RIFF") },
};
const headers = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const schema = z.object({
  client: z.enum(["spunkram-cep", "gal-cep"]),
  message: z.string().trim().min(10).max(3000),
  reply_to: z.string().trim().email().max(254),
  details: z.string().max(1500),
  diagnostics: z.string().max(16000).optional(),
});
const screenshotSchema = z.object({
  screenshots: z.array(z.object({
    mime_type: z.enum(["image/png", "image/jpeg", "image/webp"]),
    content: z.string().min(4).max(MAX_SCREENSHOT_BASE64_BYTES),
  })).min(1).max(3),
});
const rates = new Map<string, { count: number; until: number }>();
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export function supportContactOptions() {
  return new NextResponse(null, { status: 204, headers });
}

async function readScreenshotRequest(req: NextRequest): Promise<string | undefined> {
  const limit = MAX_CONTACT_BYTES + MAX_SCREENSHOT_BASE64_BYTES;
  if (Number(req.headers.get("content-length")) > limit) return undefined;
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, bytes).toString("utf8");
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => {});
        return undefined;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
}

function decodeScreenshots(body: unknown): ResendAttachment[] | undefined {
  const parsed = screenshotSchema.safeParse(body);
  if (!parsed.success) return undefined;

  const attachments: ResendAttachment[] = [];
  let bytes = 0;
  for (const screenshot of parsed.data.screenshots) {
    const format = screenshotFormats[screenshot.mime_type];
    const content = Buffer.from(screenshot.content, "base64");
    bytes += content.length;
    if (bytes > MAX_SCREENSHOT_BYTES || content.toString("base64") !== screenshot.content ||
      !content.subarray(0, format.signature.length).equals(format.signature) ||
      (screenshot.mime_type === "image/webp" && content.toString("ascii", 8, 12) !== "WEBP")) {
      return undefined;
    }
    attachments.push({ filename: `screenshot-${attachments.length + 1}.${format.extension}`, content, contentType: screenshot.mime_type });
  }
  return attachments;
}

/** The authenticated author and route choose the mailer; callers cannot set a recipient. */
export async function sendCepSupportContact(req: NextRequest, route: SupportRoute) {
  const withScreenshots = route === "gal-screenshots";
  const expectedClient = withScreenshots ? "gal-cep" : route;
  try {
    const user = await resolveCepBearerUser(req.headers.get("authorization"));
    if (!user) return reply({ error: "UNAUTHORIZED" }, 401);
    if (user.client !== expectedClient) return reply({ error: "WRONG_AUTHOR" }, 403);
    const raw = withScreenshots ? await readScreenshotRequest(req) : await req.text();
    if (raw === undefined || (!withScreenshots && Buffer.byteLength(raw, "utf8") > MAX_CONTACT_BYTES)) {
      return reply({ error: "REQUEST_TOO_LARGE" }, 413);
    }
    let body: unknown;
    try { body = JSON.parse(raw); }
    catch { return reply({ error: "INVALID_REQUEST" }, 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return reply({ error: "INVALID_REQUEST" }, 422);
    if (parsed.data.client !== user.client) return reply({ error: "WRONG_AUTHOR" }, 403);
    const screenshots = withScreenshots ? decodeScreenshots(body) : undefined;
    if (withScreenshots && !screenshots) return reply({ error: "INVALID_SCREENSHOTS" }, 422);

    const now = Date.now();
    for (const [key, value] of rates) if (value.until <= now) rates.delete(key);
    const key = `${user.client}:${user.id}`;
    const rate = rates.get(key);
    if ((rate?.count ?? 0) >= 3 || (!rate && rates.size >= 5000)) return reply({ error: "RATE_LIMITED" }, 429);
    rates.set(key, { count: (rate?.count ?? 0) + 1, until: rate?.until ?? now + 60000 });

    const data = parsed.data;
    const message = [data.message, "", `Account: ${user.email}`, `Author: ${user.client}`, data.details,
      ...(data.diagnostics ? ["", "Diagnostics:", data.diagnostics] : [])].join("\n");
    if (user.client === "spunkram-cep") {
      await sendSpunkramContactForm({ name: user.name || user.email, email: data.reply_to, message });
    } else {
      await sendGaltoolkitContactForm({
        name: user.name || user.email, email: data.reply_to, contactMessage: message, attachments: screenshots,
      });
    }
    return reply({ ok: true, delivered: true, channel: "email", ...(screenshots ? { screenshot_count: screenshots.length } : {}) });
  } catch (error) {
    console.error("[cep/support/contact] Email failed", error instanceof Error ? error.message : "Unknown error");
    return reply({ error: "EMAIL_FAILED" }, 503);
  }
}
