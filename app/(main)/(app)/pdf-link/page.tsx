import type { Metadata } from "next";
import { PdfLinkPageClient } from "@/components/pdf-link-page-client";

export const metadata: Metadata = {
    title: "PDF to Link — Motion Flow",
    description:
        "Upload a PDF and get a permanent shareable link so you can create a desktop shortcut to it.",
};

export default function PdfLinkPage() {
    return (
        <div className="relative max-w-3xl mx-auto px-6 py-12">
            <div className="mb-10">
                <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 tracking-tight">
                    PDF to Link
                </h1>
                <p className="text-muted-foreground text-lg max-w-2xl text-pretty leading-relaxed">
                    Upload a PDF file to get a permanent link you can share, bookmark, or turn into a desktop shortcut for
                    quick access from any device.
                </p>
            </div>

            <PdfLinkPageClient />
        </div>
    );
}
