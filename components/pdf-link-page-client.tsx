"use client";

import { useCallback, useId, useRef, useState } from "react";
import {
    Check,
    Copy,
    ExternalLink,
    FileText,
    Loader2,
    Trash2,
    UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { SignInModal } from "@/components/sign-in-modal";
import { cn } from "@/lib/utils";

const MAX_BYTES = 30 * 1024 * 1024;

interface UploadedPdf {
    id: string;
    url: string;
    filename: string;
    size: number;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CopyLinkButton({ url }: { url: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            toast.success("Link copied to clipboard");
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error("Could not copy the link. Please copy it manually.");
        }
    }, [url]);

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-foreground smooth hover:bg-blue-500/20"
        >
            {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
                <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy link"}
        </button>
    );
}

export function PdfLinkPageClient() {
    const { user, loading: authLoading } = useAuth();
    const [signInOpen, setSignInOpen] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<UploadedPdf[]>([]);
    const inputId = useId();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const runUpload = useCallback(
        async (file: File | undefined) => {
            if (!file) return;

            if (!user) {
                setSignInOpen(true);
                return;
            }

            const looksLikePdf =
                file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
            if (!looksLikePdf) {
                setError("Please choose a PDF file.");
                return;
            }
            if (file.size > MAX_BYTES) {
                setError(`PDF must be under ${MAX_BYTES / (1024 * 1024)} MB.`);
                return;
            }

            setError(null);
            setUploading(true);

            try {
                const body = new FormData();
                body.append("file", file);
                const res = await fetch("/api/pdf-upload", { method: "POST", body });
                const data = (await res.json().catch(() => ({}))) as {
                    url?: string;
                    filename?: string;
                    size?: number;
                    error?: string;
                };

                if (!res.ok || !data.url) {
                    if (res.status === 401) {
                        setSignInOpen(true);
                        return;
                    }
                    throw new Error(data.error || "Upload failed. Please try again.");
                }

                setResults((prev) => [
                    {
                        id: `${data.url}-${Date.now()}`,
                        url: data.url as string,
                        filename: data.filename || file.name,
                        size: data.size ?? file.size,
                    },
                    ...prev,
                ]);
                toast.success("PDF uploaded — link is ready");
            } catch (err) {
                const message = err instanceof Error ? err.message : "Upload failed";
                setError(message);
                toast.error(message);
            } finally {
                setUploading(false);
            }
        },
        [user],
    );

    const removeResult = useCallback((id: string) => {
        setResults((prev) => prev.filter((r) => r.id !== id));
    }, []);

    return (
        <div className="space-y-8">
            <div
                className={cn(
                    "relative flex min-h-55 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                    uploading && "pointer-events-none opacity-70",
                    dragOver ? "border-blue-500 bg-blue-500/10" : "border-blue-500/30 bg-card/50",
                )}
                onDragEnter={(e) => {
                    e.preventDefault();
                    if (!uploading) setDragOver(true);
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    if (!uploading) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void runUpload(e.dataTransfer.files?.[0]);
                }}
            >
                {uploading ? (
                    <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
                ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10">
                        <UploadCloud className="h-8 w-8 text-blue-400" />
                    </div>
                )}
                <div className="space-y-1.5">
                    <p className="text-base font-medium text-foreground">
                        {uploading ? "Uploading…" : "Drag & drop a PDF here"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        or{" "}
                        <label
                            htmlFor={inputId}
                            className="cursor-pointer text-blue-400 underline-offset-4 hover:underline"
                        >
                            browse a file
                        </label>{" "}
                        from your computer
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                        PDF only, up to {MAX_BYTES / (1024 * 1024)} MB
                    </p>
                </div>
                <input
                    ref={fileInputRef}
                    id={inputId}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                        void runUpload(e.target.files?.[0]);
                        e.target.value = "";
                    }}
                />
            </div>

            {!authLoading && !user && (
                <p className="text-center text-sm text-muted-foreground">
                    You&apos;ll need to{" "}
                    <button
                        type="button"
                        onClick={() => setSignInOpen(true)}
                        className="text-blue-400 hover:underline"
                    >
                        sign in
                    </button>{" "}
                    to upload a PDF and get a link.
                </p>
            )}

            {error && <p className="text-center text-sm text-red-400">{error}</p>}

            {results.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Your links
                    </h2>
                    <ul className="space-y-2">
                        {results.map((r) => (
                            <li
                                key={r.id}
                                className="flex flex-col gap-3 rounded-2xl border border-blue-500/20 bg-card/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                                        <FileText className="h-5 w-5 text-blue-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground" title={r.filename}>
                                            {r.filename}
                                        </p>
                                        <a
                                            href={r.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-blue-400"
                                        >
                                            <span className="truncate">{r.url}</span>
                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                        </a>
                                        <p className="text-[11px] text-muted-foreground/70">{formatBytes(r.size)}</p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                                    <CopyLinkButton url={r.url} />
                                    <button
                                        type="button"
                                        onClick={() => removeResult(r.id)}
                                        aria-label="Remove from this list"
                                        title="Remove from this list"
                                        className="rounded-lg p-1.5 text-muted-foreground smooth hover:bg-red-500/10 hover:text-red-400"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="rounded-3xl border border-blue-500/20 bg-card/80 p-8 backdrop-blur-sm">
                <h2 className="mb-4 text-xl font-semibold text-foreground">
                    How to turn a link into a desktop shortcut
                </h2>
                <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-blue-400">Windows</h3>
                        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                            <li>Right-click an empty spot on the desktop.</li>
                            <li>
                                Choose <span className="text-foreground">New → Shortcut</span>.
                            </li>
                            <li>Paste the copied link and click Next.</li>
                            <li>Give the shortcut a name and click Finish.</li>
                        </ol>
                    </div>
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-blue-400">macOS</h3>
                        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                            <li>Open the link in Safari or Chrome.</li>
                            <li>Drag the small icon from the address bar onto the desktop.</li>
                            <li>
                                This creates a <span className="text-foreground">.webloc</span> (or .url) file — double-click it anytime to open the PDF.
                            </li>
                        </ol>
                    </div>
                </div>
                <p className="mt-6 text-xs leading-relaxed text-muted-foreground/80">
                    The link points directly to your file and stays the same, so the shortcut will keep working. Double-clicking
                    it opens the PDF in your browser instead of a local app — handy for quick access from any of your devices
                    without keeping a local copy. Note that this session&apos;s list above is not saved after you leave the
                    page, so copy any links you need before navigating away.
                </p>
            </div>

            <SignInModal
                open={signInOpen}
                onOpenChange={setSignInOpen}
                onAuthSuccess={() => setSignInOpen(false)}
            />
        </div>
    );
}
