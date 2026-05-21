import "server-only";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { getR2Client } from "@/lib/r2-storage";
import { sendTelegramRequestsReport } from "@/lib/telegram";

/**
 * Contact-form requests — ports of the Laravel pipeline in
 * `app/Http/Controllers/Admin/Requests.php::collectRequests()`:
 *
 *   1. Validate fields (done in the API route via zod).
 *   2. Collect `pc_info` (UA → browser/OS/device + IP).
 *   3. Optionally store an attachment.
 *   4. Insert a row into `request_messages` (same schema used by the Laravel adminzone).
 *   5. Send a Telegram notification to the staff chat.
 *
 * Adminzone (Laravel) keeps reading from `request_messages` directly, so new submissions
 * from this Next.js app appear there without any further work.
 */

const TABLE = "request_messages";

/** Mirrors Laravel `Requests::collectRequests` — staff #6 is the default assignee. */
const DEFAULT_ASSIGNED_STAFF_ID = 6;

/** Where to store attachments. Mirrors `config('aniom.paths.page_content.requests.attachments')`. */
const ATTACHMENTS_KEY_PREFIX = "requests/attachments/";

/** Same MIME / size limits as Laravel: `mimes:png,jpg,jpeg,zip|max:2048`. */
export const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_ALLOWED_MIME = new Set<string>([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
]);
const ATTACHMENT_EXT_BY_MIME: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
};

/** Whitelisted file extensions when MIME is missing/generic (e.g. browser sends `application/octet-stream`). */
const ATTACHMENT_ALLOWED_EXT = new Set<string>(["png", "jpg", "jpeg", "zip"]);

export type ContactRequestType =
    | "business_contact"
    | "support_contact"
    | "bug_report"
    | "become_author_request"
    | "become_affiliate_request";

export interface ContactPcInfo {
    browser: string;
    device: "Computer" | "Mobile" | "Tablet";
    os: string;
    ip: string;
}

export interface CreateContactRequestInput {
    type: ContactRequestType;
    /** Free-form payload — gets JSON-encoded into `content_json` (same as Laravel). */
    content: Record<string, unknown>;
    /** Logged-in user id, if any. */
    userId?: number | null;
    /** Computed via `extractPcInfo(headers)`. */
    pcInfo: ContactPcInfo;
    /** Optional uploaded file. */
    attachment?: File | null;
}

export interface CreateContactRequestResult {
    requestId: number;
    attachmentKey: string | null;
    attachmentFilename: string | null;
}

/* -------------------------------------------------------------------------- */
/*  PC info — port of `app/Helpers/UserSystemInfoHelper.php`                  */
/* -------------------------------------------------------------------------- */

const OS_PATTERNS: Array<[RegExp, string]> = [
    [/windows nt 10/i, "Windows 10"],
    [/windows nt 6\.3/i, "Windows 8.1"],
    [/windows nt 6\.2/i, "Windows 8"],
    [/windows nt 6\.1/i, "Windows 7"],
    [/windows nt 6\.0/i, "Windows Vista"],
    [/windows nt 5\.2/i, "Windows Server 2003/XP x64"],
    [/windows nt 5\.1/i, "Windows XP"],
    [/windows xp/i, "Windows XP"],
    [/windows nt 5\.0/i, "Windows 2000"],
    [/windows me/i, "Windows ME"],
    [/win98/i, "Windows 98"],
    [/win95/i, "Windows 95"],
    [/win16/i, "Windows 3.11"],
    [/macintosh|mac os x/i, "Mac OS X"],
    [/mac_powerpc/i, "Mac OS 9"],
    [/ubuntu/i, "Ubuntu"],
    [/linux/i, "Linux"],
    [/iphone/i, "iPhone"],
    [/ipod/i, "iPod"],
    [/ipad/i, "iPad"],
    [/android/i, "Android"],
    [/blackberry/i, "BlackBerry"],
    [/webos/i, "Mobile"],
];

const BROWSER_PATTERNS: Array<[RegExp, string]> = [
    [/msie|Trident/i, "Internet Explorer"],
    [/firefox/i, "Firefox"],
    [/edge/i, "Edge"],
    [/opera/i, "Opera"],
    [/chrome/i, "Chrome"],
    [/safari/i, "Safari"],
    [/maxthon/i, "Maxthon"],
    [/knoqueror/i, "Konqueror"],
    [/ubrowser/i, "UC Browser"],
];

function detectOs(ua: string): string {
    for (const [re, label] of OS_PATTERNS) {
        if (re.test(ua)) return label;
    }
    return "Unknown OS Platform";
}

function detectBrowser(ua: string): string {
    for (const [re, label] of BROWSER_PATTERNS) {
        if (re.test(ua)) return label;
    }
    return "Unknown Browser";
}

function detectDevice(ua: string): ContactPcInfo["device"] {
    const lower = ua.toLowerCase();
    const tablet =
        /(tablet|ipad|playbook)/.test(lower) ||
        /android(?!.*(mobi|opera mini))/.test(lower);
    if (tablet) return "Tablet";

    const mobile =
        /(up\.browser|up\.link|mmp|symbian|smartphone|midp|wap|phone|android|iemobile)/.test(
            lower,
        );
    if (mobile) return "Mobile";

    return "Computer";
}

function pickClientIp(headers: Headers): string {
    // Cloudflare / common reverse proxies come first, then standard forwarded-for.
    const candidates = [
        headers.get("cf-connecting-ip"),
        headers.get("true-client-ip"),
        headers.get("x-real-ip"),
        headers.get("x-client-ip"),
    ];
    for (const v of candidates) {
        if (v && v.trim()) return v.trim();
    }
    const xff = headers.get("x-forwarded-for");
    if (xff && xff.trim()) {
        // First entry in the X-Forwarded-For chain is the original client.
        const first = xff.split(",")[0]?.trim();
        if (first) return first;
    }
    return "UNKNOWN";
}

/** Compute browser/device/OS/IP from request headers — port of `UserSystemInfoHelper::main_pc_info()`. */
export function extractPcInfo(headers: Headers): ContactPcInfo {
    const ua = headers.get("user-agent") ?? "";
    return {
        browser: detectBrowser(ua),
        device: detectDevice(ua),
        os: detectOs(ua),
        ip: pickClientIp(headers),
    };
}

/* -------------------------------------------------------------------------- */
/*  R2 attachment upload                                                      */
/* -------------------------------------------------------------------------- */

function attachmentExtensionFor(file: File): string | null {
    const mime = (file.type || "").toLowerCase();
    if (mime && ATTACHMENT_EXT_BY_MIME[mime]) return ATTACHMENT_EXT_BY_MIME[mime];

    const name = file.name || "";
    const dot = name.lastIndexOf(".");
    if (dot >= 0) {
        const ext = name.slice(dot + 1).toLowerCase();
        if (ATTACHMENT_ALLOWED_EXT.has(ext)) return ext === "jpeg" ? "jpg" : ext;
    }
    return null;
}

export interface AttachmentValidationError {
    error: "too_large" | "bad_type";
    message: string;
}

/** Returns `null` if the file is acceptable, else a structured error for the API to surface. */
export function validateAttachment(file: File): AttachmentValidationError | null {
    if (file.size <= 0) {
        return { error: "bad_type", message: "Attachment is empty." };
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
        return {
            error: "too_large",
            message: "Attachment is larger than 2 MB.",
        };
    }
    if (!attachmentExtensionFor(file)) {
        return {
            error: "bad_type",
            message: "Attachment must be PNG, JPG/JPEG or ZIP.",
        };
    }
    return null;
}

/**
 * Upload an attachment to the **private** R2 bucket (`R2_BUCKET`, same one used for
 * marketplace zips). Object key shape: `requests/attachments/<timestamp>.<ext>` so it
 * lines up with the Laravel adminzone expectation (`<timestamp>.<ext>` is what lands
 * in `request_messages.attachments`).
 *
 * Returns `{ filename, key }` on success. `filename` is what goes in the DB column;
 * `key` is the full R2 object key (for retrieval via a presigned URL if needed).
 *
 * @throws if `R2_BUCKET` is not configured or upload fails.
 */
export async function uploadContactAttachment(
    file: File,
): Promise<{ filename: string; key: string }> {
    const bucket = process.env.R2_BUCKET?.trim();
    if (!bucket) {
        throw new Error("R2_BUCKET is not configured");
    }

    const ext = attachmentExtensionFor(file);
    if (!ext) {
        throw new Error("Unsupported attachment file type");
    }

    // Laravel name was `Carbon::now()->timestamp.'.'.$ext`; we add a short random suffix
    // to avoid collisions when two visitors submit in the same second.
    const ts = Math.floor(Date.now() / 1000);
    const suffix = Math.random().toString(36).slice(2, 6);
    const filename = `${ts}-${suffix}.${ext}`;
    const key = `${ATTACHMENTS_KEY_PREFIX}${filename}`;

    const contentType = file.type || (ext === "zip" ? "application/zip" : `image/${ext === "jpg" ? "jpeg" : ext}`);
    const body = Buffer.from(await file.arrayBuffer());

    const client = getR2Client();
    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
        }),
    );

    return { filename, key };
}

/* -------------------------------------------------------------------------- */
/*  DB insert + Telegram notification                                         */
/* -------------------------------------------------------------------------- */

function buildAdminzoneRequestUrl(requestId: number): string {
    const base =
        process.env.ADMINZONE_REQUESTS_URL?.trim().replace(/\/+$/, "") ||
        "https://motionflow.com/adminzone/requests";
    return `${base}/view?id=${requestId}`;
}

/** Laravel `Str::headline('business_contact')` → "Business Contact". */
function toHeadline(value: string): string {
    return value
        .replace(/[_-]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

async function notifyTelegramNewRequest(
    requestId: number,
    type: ContactRequestType,
): Promise<void> {
    const section = toHeadline(type);
    const url = buildAdminzoneRequestUrl(requestId);
    // Same shape as Laravel `requestTelegramAssignedReports('new', …)`:
    //   "Новый запрос #ID в секции <Section>\nПерейти к запросу: <url>"
    const text = `Новый запрос #${requestId} в секции ${section}\nПерейти к запросу: ${url}`;
    await sendTelegramRequestsReport(text, { parseMode: "Markdown" });
}

/**
 * Insert a `request_messages` row + fire the Telegram notification, exactly like
 * Laravel `Requests::collectRequests`. Attachment upload to R2 is performed first
 * (if provided), so the DB row points at an existing object.
 */
export async function createContactRequest(
    input: CreateContactRequestInput,
): Promise<CreateContactRequestResult> {
    let attachmentFilename: string | null = null;
    let attachmentKey: string | null = null;

    if (input.attachment) {
        const uploaded = await uploadContactAttachment(input.attachment);
        attachmentFilename = uploaded.filename;
        attachmentKey = uploaded.key;
    }

    const pool = getPool();
    const [header] = await pool.execute<ResultSetHeader>(
        `INSERT INTO \`${TABLE}\`
            (user_id, assigned_staff_id, type, content_json, pc_info, attachments, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
            input.userId ?? null,
            DEFAULT_ASSIGNED_STAFF_ID,
            input.type,
            JSON.stringify(input.content),
            JSON.stringify(input.pcInfo),
            attachmentFilename,
        ],
    );
    const requestId = Number(header.insertId) || 0;
    if (!requestId) {
        throw new Error("Failed to insert request_messages row");
    }

    // Telegram is best-effort: failure must not roll back the saved request.
    notifyTelegramNewRequest(requestId, input.type).catch((err) => {
        console.error("[contact-requests] telegram notify failed:", err);
    });

    return { requestId, attachmentKey, attachmentFilename };
}
