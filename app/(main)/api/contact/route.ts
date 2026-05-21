import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
    ATTACHMENT_ALLOWED_MIME,
    ATTACHMENT_MAX_BYTES,
    createContactRequest,
    extractPcInfo,
    validateAttachment,
} from "@/lib/contact-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contact-form submissions for `/contact`.
 *
 * Port of Laravel `Admin\Requests::collectRequests` (`requestMethod=business_contact`):
 *   - validates the payload with the same field limits as Laravel,
 *   - optionally uploads the attachment to private R2 (`R2_BUCKET`),
 *   - inserts into `admin_core.request_messages` (the table used by the existing
 *     Laravel adminzone, so new entries show up there automatically),
 *   - fires a Telegram notification to the staff chat.
 *
 * Notes:
 *   - reCAPTCHA from the Laravel form is intentionally not ported here (out of scope).
 *   - No email is sent at submission — same behaviour as Laravel; replies are sent
 *     from adminzone manually.
 */

const REQUEST_TYPES = ["business", "marketing", "questionOrWish", "other"] as const;
type FormRequestType = (typeof REQUEST_TYPES)[number];

const baseSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(40, "Name is too long"),
    email: z
        .string()
        .trim()
        .min(1, "Email is required")
        .max(70, "Email is too long")
        .email("Invalid email"),
    requestType: z.enum(REQUEST_TYPES),
    subject: z.string().trim().max(70, "Subject is too long").optional(),
    textMessage: z
        .string()
        .trim()
        .min(1, "Message is required")
        .max(400, "Message is too long (max 400 characters)"),
});

type ParsedBody = z.infer<typeof baseSchema>;

interface ValidationFailure {
    response: NextResponse;
}

interface ValidationSuccess {
    data: ParsedBody;
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

    const raw = {
        name: form.get("name")?.toString() ?? "",
        email: form.get("email")?.toString() ?? "",
        requestType: form.get("requestType")?.toString() ?? "",
        subject: form.get("subject")?.toString() || undefined,
        textMessage: form.get("textMessage")?.toString() ?? "",
    };

    const parsed = baseSchema.safeParse(raw);
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

    // `subject` is required only when `requestType === "other"` (mirrors Laravel `Rule::requiredIf`).
    if (parsed.data.requestType === "other" && !parsed.data.subject?.trim()) {
        return {
            response: NextResponse.json(
                {
                    ok: false,
                    error: "Validation failed",
                    errors: { subject: ["Subject is required when type is Other"] },
                },
                { status: 422 },
            ),
        };
    }

    const rawAttachment = form.get("attachFile");
    let attachment: File | null = null;
    if (rawAttachment instanceof File && rawAttachment.size > 0) {
        // Some browsers send a generic `application/octet-stream` — we accept it but
        // still verify the extension downstream in `validateAttachment`.
        const mime = (rawAttachment.type || "").toLowerCase();
        if (mime && !ATTACHMENT_ALLOWED_MIME.has(mime)) {
            return {
                response: NextResponse.json(
                    {
                        ok: false,
                        error: "Validation failed",
                        errors: { attachFile: ["Attachment must be PNG, JPG/JPEG or ZIP"] },
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

function buildContentPayload(
    data: ParsedBody,
    extras: { sessionEmail?: string | null },
): Record<string, unknown> {
    // Same shape as Laravel `$req->except(['requestMethod', 'attachFile', 'g-recaptcha-response'])`.
    // We persist exactly the form fields so adminzone keeps rendering them via `Str::headline()`.
    const content: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        requestType: mapRequestTypeForLaravel(data.requestType),
        textMessage: data.textMessage,
    };
    if (data.requestType === "other" && data.subject) {
        content.subject = data.subject.trim();
    }
    if (extras.sessionEmail && extras.sessionEmail !== data.email) {
        content.accountEmail = extras.sessionEmail;
    }
    return content;
}

/**
 * Laravel form values for `business_contact` are: `business`, `marketing`,
 * `questionOrWish`, `other` (see `resources/views/contact/inc/main-contact-form.blade.php`).
 * Persist them verbatim — adminzone humanises them via `Str::headline()`.
 */
function mapRequestTypeForLaravel(t: FormRequestType): string {
    return t;
}

export async function POST(req: NextRequest) {
    try {
        const parsed = await readForm(req);
        if ("response" in parsed) return parsed.response;

        const sessionUser = await getSessionUser().catch(() => null);
        const pcInfo = extractPcInfo(req.headers);
        const content = buildContentPayload(parsed.data, {
            sessionEmail: sessionUser?.email ?? null,
        });

        let result;
        try {
            result = await createContactRequest({
                type: "business_contact",
                content,
                userId: sessionUser?.id ?? null,
                pcInfo,
                attachment: parsed.attachment,
            });
        } catch (err) {
            console.error("[api/contact] createContactRequest failed:", err);
            return NextResponse.json(
                { ok: false, error: "Could not save your request. Please try again." },
                { status: 500 },
            );
        }

        return NextResponse.json({ ok: true, requestId: result.requestId });
    } catch (err) {
        console.error("[api/contact] unexpected error:", err);
        return NextResponse.json(
            { ok: false, error: "Unexpected error. Please try again." },
            { status: 500 },
        );
    }
}
