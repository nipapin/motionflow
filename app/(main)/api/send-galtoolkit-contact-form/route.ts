import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendGaltoolkitContactForm } from "@/lib/laravel-port/galtoolkit-mailer";
import { validateGalContactAttachment } from "@/lib/gal-contact-attachment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Port of Laravel `GalContactFormController::sendContactForm` — validates the
 * payload with the same field limits and sends via Resend to `CONTACT_FORM_EMAIL`.
 *
 * Distinct from `/api/contact` (the newer R2 + Telegram pipeline). This one is
 * the `name/email/message` mailer with an optional attachment used by the
 * PremiereGal Galtoolkit page. Legacy JSON submissions remain supported.
 */

const schema = z.object({
    name: z.string().trim().min(1, "Name is required").max(255, "Name is too long"),
    email: z
        .string()
        .trim()
        .min(1, "Email is required")
        .max(255, "Email is too long")
        .email("Invalid email"),
    message: z
        .string()
        .trim()
        .min(1, "Message is required")
        .max(1000, "Message is too long (max 1000 characters)"),
});

async function readBody(req: NextRequest): Promise<unknown> {
    const ct = (req.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("application/json")) {
        try {
            return await req.json();
        } catch {
            return null;
        }
    }
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
        try {
            const form = await req.formData();
            return Object.fromEntries(form.entries());
        } catch {
            return null;
        }
    }
    try {
        return await req.json();
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    const raw = await readBody(req);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
            const key = issue.path[0]?.toString() ?? "_";
            (errors[key] ??= []).push(issue.message);
        }
        return NextResponse.json(
            { message: "The given data was invalid.", errors },
            { status: 422 },
        );
    }

    const rawAttachment = (raw as Record<string, unknown>).attachFile;
    let attachment: File | null = null;
    if (rawAttachment != null) {
        const error = rawAttachment instanceof File
            ? validateGalContactAttachment(rawAttachment)
            : "Attachment must be a file.";
        if (error) {
            return NextResponse.json(
                { message: "The given data was invalid.", errors: { attachFile: [error] } },
                { status: 422 },
            );
        }
        attachment = rawAttachment as File;
    }

    try {
        await sendGaltoolkitContactForm({
            name: parsed.data.name,
            email: parsed.data.email,
            contactMessage: parsed.data.message,
            attachment,
        });
    } catch (err) {
        console.error("[send-galtoolkit-contact-form] SMTP send failed:", err);
        return NextResponse.json(
            { success: false, message: "Could not send your message. Please try again later." },
            { status: 500 },
        );
    }

    return NextResponse.json({
        success: true,
        message: "Contact form sent successfully",
    });
}
