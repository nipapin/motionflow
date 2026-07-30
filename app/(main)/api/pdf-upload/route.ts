import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { r2KeyFromPublicUrl, uploadBufferToR2 } from "@/lib/r2-storage";

export const runtime = "nodejs";

const MAX_BYTES = 30 * 1024 * 1024;
const PDF_MAGIC = Buffer.from("%PDF");

// Uploads can be replaced in place later on, so avoid the long-lived
// "immutable" default cache-control other R2 uploads use — a short,
// revalidate-on-use lifetime keeps shortcuts pointing at fresh content.
const PDF_CACHE_CONTROL = "public, max-age=60, must-revalidate";

function slugifyFileName(name: string): string {
    const withoutExt = name.replace(/\.pdf$/i, "");
    const slug = withoutExt
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return slug || "document";
}

/** Splits an owned R2 key like `pdf/42/report-ab12cd34.pdf` into upload options. */
function ownedKeyToUploadTarget(
    key: string,
    userId: number,
): { keyPrefix: string; baseName: string } | null {
    const segments = key.split("/");
    if (segments.length < 3) return null;
    const [folder, ownerId, ...rest] = segments;
    if (folder !== "pdf" || ownerId !== String(userId) || rest.length === 0) {
        return null;
    }
    const last = rest.pop() as string;
    const baseName = last.replace(/\.pdf$/i, "");
    if (!baseName) return null;
    return { keyPrefix: ["pdf", ownerId, ...rest].join("/"), baseName };
}

export async function POST(req: NextRequest) {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json(
                { error: "Please sign in to upload PDF files." },
                { status: 401 },
            );
        }

        const form = await req.formData().catch(() => null);
        const file = form?.get("file");
        const replaceUrl = form?.get("replaceUrl");

        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: "Expected a file field named \"file\"." },
                { status: 400 },
            );
        }

        if (file.size <= 0 || file.size > MAX_BYTES) {
            return NextResponse.json(
                { error: `PDF must be under ${MAX_BYTES / (1024 * 1024)} MB.` },
                { status: 400 },
            );
        }

        const looksLikePdfName = file.name.toLowerCase().endsWith(".pdf");
        const looksLikePdfType = file.type === "application/pdf";
        if (!looksLikePdfName && !looksLikePdfType) {
            return NextResponse.json(
                { error: "Please upload a PDF file." },
                { status: 400 },
            );
        }

        let uploadTarget: { keyPrefix: string; baseName: string } | null = null;
        if (typeof replaceUrl === "string" && replaceUrl.trim()) {
            const key = r2KeyFromPublicUrl(replaceUrl.trim());
            uploadTarget = key ? ownedKeyToUploadTarget(key, user.id) : null;
            if (!uploadTarget) {
                return NextResponse.json(
                    { error: "That link doesn't belong to one of your uploads." },
                    { status: 403 },
                );
            }
        }

        const buf = Buffer.from(await file.arrayBuffer());
        if (!buf.subarray(0, 4).equals(PDF_MAGIC)) {
            return NextResponse.json(
                { error: "This file doesn't look like a valid PDF." },
                { status: 400 },
            );
        }

        const { keyPrefix, baseName } =
            uploadTarget ?? {
                keyPrefix: `pdf/${user.id}`,
                baseName: `${slugifyFileName(file.name)}-${randomUUID().slice(0, 8)}`,
            };

        let url: string;
        try {
            const result = await uploadBufferToR2(buf, {
                contentType: "application/pdf",
                keyPrefix,
                baseName,
                extension: "pdf",
                cacheControl: PDF_CACHE_CONTROL,
            });
            url = result.url;
        } catch (err) {
            console.error("[pdf-upload] R2 upload failed:", err);
            return NextResponse.json(
                { error: "Could not store the file. Please try again." },
                { status: 502 },
            );
        }

        return NextResponse.json({
            url,
            filename: file.name,
            size: file.size,
            replaced: uploadTarget !== null,
        });
    } catch (error) {
        console.error("[pdf-upload] unexpected error:", error);
        return NextResponse.json(
            { error: "Upload failed. Please try again." },
            { status: 500 },
        );
    }
}
