import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    ATTACHMENT_ALLOWED_MIME,
    ATTACHMENT_MAX_BYTES,
    validateAttachment,
} from "@/lib/contact-requests";
import { sendSpunkramContactForm } from "@/lib/spunkram-mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
    name: z.string().trim().min(1, "Name is required").max(40, "Name is too long"),
    email: z
        .string()
        .trim()
        .min(1, "Email is required")
        .max(70, "Email is too long")
        .email("Invalid email"),
    message: z
        .string()
        .trim()
        .min(10, "Message must be at least 10 characters")
        .max(4000, "Message is too long"),
});

interface ValidationFailure {
    response: NextResponse;
}

interface ValidationSuccess {
    data: z.infer<typeof schema>;
    attachment: File | null;
}

async function readForm(req: NextRequest): Promise<ValidationFailure | ValidationSuccess> {
    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return {
            response: NextResponse.json(
                { ok: false, error: "Invalid form data" },
                { status: 400 },
            ),
        };
    }

    const parsed = schema.safeParse({
        name: form.get("name")?.toString() ?? "",
        email: form.get("email")?.toString() ?? "",
        message: form.get("message")?.toString() ?? "",
    });

    if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
            const key = issue.path[0]?.toString() ?? "_";
            (fieldErrors[key] ??= []).push(issue.message);
        }
        return {
            response: NextResponse.json(
                { ok: false, error: "Validation failed", errors: fieldErrors },
                { status: 422 },
            ),
        };
    }

    const rawAttachment = form.get("attachFile");
    let attachment: File | null = null;
    if (rawAttachment instanceof File && rawAttachment.size > 0) {
        const mime = (rawAttachment.type || "").toLowerCase();
        if (mime && !ATTACHMENT_ALLOWED_MIME.has(mime)) {
            return {
                response: NextResponse.json(
                    {
                        ok: false,
                        error: "Validation failed",
                        errors: { attachFile: ["Attachment must be PNG, JPG/JPEG"] },
                    },
                    { status: 422 },
                ),
            };
        }
        if (rawAttachment.size > ATTACHMENT_MAX_BYTES) {
            return {
                response: NextResponse.json(
                    {
                        ok: false,
                        error: "Validation failed",
                        errors: { attachFile: ["Attachment is larger than 2 MB"] },
                    },
                    { status: 422 },
                ),
            };
        }
        const fileError = validateAttachment(rawAttachment);
        if (fileError) {
            return {
                response: NextResponse.json(
                    {
                        ok: false,
                        error: "Validation failed",
                        errors: { attachFile: [fileError.message] },
                    },
                    { status: 422 },
                ),
            };
        }
        attachment = rawAttachment;
    }

    return { data: parsed.data, attachment };
}

export async function POST(req: NextRequest) {
    try {
        const parsed = await readForm(req);
        if ("response" in parsed) return parsed.response;

        try {
            await sendSpunkramContactForm({
                name: parsed.data.name,
                email: parsed.data.email,
                message: parsed.data.message,
                attachment: parsed.attachment,
            });
        } catch (err) {
            console.error("[api/spunkram-form] SMTP send failed:", err);
            return NextResponse.json(
                { ok: false, error: "Could not send your message. Please try again." },
                { status: 500 },
            );
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[api/spunkram-form] unexpected error:", err);
        return NextResponse.json(
            { ok: false, error: "Unexpected error. Please try again." },
            { status: 500 },
        );
    }
}
