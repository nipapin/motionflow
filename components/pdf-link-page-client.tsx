"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
    Check,
    Copy,
    ExternalLink,
    FileText,
    Loader2,
    RefreshCw,
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
    updatedAt: string;
}

interface UploadResponse {
    id?: string | null;
    url?: string;
    filename?: string;
    size?: number;
    replaced?: boolean;
    error?: string;
}

interface ListResponse {
    items?: Array<{
        id: string;
        url: string;
        filename: string;
        size: number;
        updated_at: string;
    }>;
    error?: string;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function validatePdfFile(file: File): string | null {
    const looksLikePdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) return "Please choose a PDF file.";
    if (file.size > MAX_BYTES) return `PDF must be under ${MAX_BYTES / (1024 * 1024)} MB.`;
    return null;
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
    const [listLoading, setListLoading] = useState(false);
    const inputId = useId();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [replacingId, setReplacingId] = useState<string | null>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const pendingReplaceRef = useRef<{ id: string; url: string } | null>(null);

    const [deletingId, setDeletingId] = useState<string | null>(null);

    const refreshList = useCallback(async () => {
        if (!user) {
            setResults([]);
            return;
        }
        setListLoading(true);
        try {
            const res = await fetch("/api/pdf-uploads", { credentials: "include", cache: "no-store" });
            const data = (await res.json().catch(() => ({}))) as ListResponse;
            if (!res.ok) throw new Error(data.error || "Failed to load your PDFs.");
            setResults(
                (data.items ?? []).map((item) => ({
                    id: item.id,
                    url: item.url,
                    filename: item.filename,
                    size: item.size,
                    updatedAt: item.updated_at,
                })),
            );
        } catch (err) {
            console.error("[pdf-link] list failed:", err);
        } finally {
            setListLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (!authLoading) void refreshList();
    }, [authLoading, refreshList]);

    const runUpload = useCallback(
        async (file: File | undefined, opts?: { replaceUrl?: string }) => {
            if (!file) return;

            if (!user) {
                setSignInOpen(true);
                return;
            }

            const validationError = validatePdfFile(file);
            if (validationError) {
                setError(validationError);
                toast.error(validationError);
                return;
            }

            setError(null);

            try {
                const body = new FormData();
                body.append("file", file);
                if (opts?.replaceUrl) body.append("replaceUrl", opts.replaceUrl);

                const res = await fetch("/api/pdf-upload", { method: "POST", body });
                const data = (await res.json().catch(() => ({}))) as UploadResponse;

                if (!res.ok || !data.url) {
                    if (res.status === 401) {
                        setSignInOpen(true);
                        return;
                    }
                    throw new Error(data.error || "Upload failed. Please try again.");
                }

                toast.success(
                    data.replaced ? "File replaced — the link stays the same" : "PDF uploaded — link is ready",
                );
                await refreshList();
            } catch (err) {
                const message = err instanceof Error ? err.message : "Upload failed";
                setError(message);
                toast.error(message);
            }
        },
        [refreshList, user],
    );

    const handleUploadNew = useCallback(
        async (file: File | undefined) => {
            setUploading(true);
            try {
                await runUpload(file);
            } finally {
                setUploading(false);
            }
        },
        [runUpload],
    );

    const startReplace = useCallback((id: string, url: string) => {
        pendingReplaceRef.current = { id, url };
        setReplacingId(id);
        replaceInputRef.current?.click();
    }, []);

    const handleReplaceFileChosen = useCallback(
        async (file: File | undefined) => {
            const target = pendingReplaceRef.current;
            if (!file || !target) {
                setReplacingId(null);
                return;
            }
            try {
                await runUpload(file, { replaceUrl: target.url });
            } finally {
                setReplacingId(null);
                pendingReplaceRef.current = null;
            }
        },
        [runUpload],
    );

    const removeResult = useCallback(
        async (id: string) => {
            setDeletingId(id);
            try {
                const res = await fetch(`/api/pdf-uploads/${id}`, {
                    method: "DELETE",
                    credentials: "include",
                });
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(data.error || "Failed to delete the PDF.");
                setResults((prev) => prev.filter((r) => r.id !== id));
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to delete the PDF.";
                toast.error(message);
            } finally {
                setDeletingId(null);
            }
        },
        [],
    );

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
                    void handleUploadNew(e.dataTransfer.files?.[0]);
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
                        void handleUploadNew(e.target.files?.[0]);
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

            {user && (listLoading || results.length > 0) && (
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Your uploaded PDFs
                    </h2>
                    {listLoading && results.length === 0 ? (
                        <div className="flex items-center justify-center gap-2 rounded-2xl border border-blue-500/20 bg-card/50 p-6 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading your PDFs…
                        </div>
                    ) : (
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
                                            <p className="text-[11px] text-muted-foreground/70">
                                                {formatBytes(r.size)} · updated {formatDate(r.updatedAt)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                                        <CopyLinkButton url={r.url} />
                                        <button
                                            type="button"
                                            onClick={() => startReplace(r.id, r.url)}
                                            disabled={replacingId === r.id || deletingId === r.id}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-transparent px-3 py-1.5 text-xs font-medium text-foreground smooth hover:bg-blue-500/10 disabled:opacity-60"
                                        >
                                            {replacingId === r.id ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <RefreshCw className="h-3.5 w-3.5" />
                                            )}
                                            Replace file
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void removeResult(r.id)}
                                            disabled={deletingId === r.id || replacingId === r.id}
                                            aria-label="Delete this PDF"
                                            title="Delete this PDF"
                                            className="rounded-lg p-1.5 text-muted-foreground smooth hover:bg-red-500/10 hover:text-red-400 disabled:opacity-60"
                                        >
                                            {deletingId === r.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <input
                ref={replaceInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                    void handleReplaceFileChosen(e.target.files?.[0]);
                    e.target.value = "";
                }}
            />

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
                    The link points directly to your file and stays the same, so the shortcut will keep working even after
                    you replace the PDF behind it. Come back to this page anytime and use “Replace file” next to the entry
                    in “Your uploaded PDFs” to swap its content — no need to paste the link anywhere, the list remembers it
                    for you. Double-clicking the shortcut opens the PDF in your browser instead of a local app, which is
                    handy for quick access from any of your devices without keeping a local copy.
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
