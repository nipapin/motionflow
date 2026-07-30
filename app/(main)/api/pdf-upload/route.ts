import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { uploadBufferToR2 } from "@/lib/r2-storage";

export const runtime = "nodejs";

const MAX_BYTES = 30 * 1024 * 1024;
const PDF_MAGIC = Buffer.from("%PDF");

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

        const buf = Buffer.from(await file.arrayBuffer());
        if (!buf.subarray(0, 4).equals(PDF_MAGIC)) {
            return NextResponse.json(
                { error: "This file doesn't look like a valid PDF." },
                { status: 400 },
            );
        }

        const baseName = `${slugifyFileName(file.name)}-${randomUUID().slice(0, 8)}`;

        let url: string;
        try {
            const result = await uploadBufferToR2(buf, {
                contentType: "application/pdf",
                keyPrefix: `pdf/${user.id}`,
                extension: "pdf",
                baseName,
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
        });
    } catch (error) {
        console.error("[pdf-upload] unexpected error:", error);
        return NextResponse.json(
            { error: "Upload failed. Please try again." },
            { status: 500 },
        );
    }
}
