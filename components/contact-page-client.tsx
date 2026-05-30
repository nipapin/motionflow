"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Client-side contact form.
 *
 * UX inputs (port of `resources/views/contact/inc/main-contact-form.blade.php`):
 *   - name (max 40)
 *   - email (max 70)
 *   - requestType: Business / Marketing / Question or Wish / Other
 *   - subject (max 70) — only when requestType=Other
 *   - textMessage (max 400)
 *   - attachFile — png/jpg/jpeg/zip, ≤ 2 MB
 *
 * Submits as `multipart/form-data` to `/api/contact`, which inserts into the same
 * `request_messages` table the existing Laravel adminzone reads from.
 */

const REQUEST_TYPES: Array<{ value: string; label: string }> = [
    { value: "business", label: "I have a Business offer" },
    { value: "marketing", label: "I have a Marketing offer" },
    { value: "questionOrWish", label: "Question / or Wish" },
    { value: "other", label: "Other" },
];

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTS = ["png", "jpg", "jpeg", "zip"];

type Status = "idle" | "sending" | "sent" | "error";

interface ApiErrorBody {
    ok?: boolean;
    error?: string;
    errors?: Record<string, string[]>;
}

export function ContactPageClient() {
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        requestType: "",
        subject: "",
        textMessage: "",
    });
    const [attachment, setAttachment] = useState<File | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<Status>("idle");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isOther = formData.requestType === "other";
    const isSending = status === "sending";
    const isSent = status === "sent";

    function update<K extends keyof typeof formData>(key: K, value: string) {
        setFormData((prev) => ({ ...prev, [key]: value }));
        if (fieldErrors[key]) {
            setFieldErrors((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        }
    }

    function clearAttachment() {
        setAttachment(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setFieldErrors((prev) => {
            if (!prev.attachFile) return prev;
            const next = { ...prev };
            delete next.attachFile;
            return next;
        });
    }

    function pickAttachment(file: File | null) {
        if (!file) {
            clearAttachment();
            return;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ALLOWED_ATTACHMENT_EXTS.includes(ext)) {
            setFieldErrors((prev) => ({
                ...prev,
                attachFile: "File must be PNG, JPG/JPEG or ZIP.",
            }));
            return;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
            setFieldErrors((prev) => ({
                ...prev,
                attachFile: "File is larger than 2 MB.",
            }));
            return;
        }
        setAttachment(file);
        setFieldErrors((prev) => {
            if (!prev.attachFile) return prev;
            const next = { ...prev };
            delete next.attachFile;
            return next;
        });
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (isSending) return;

        if (!formData.requestType) {
            setFieldErrors((prev) => ({ ...prev, requestType: "Please select a request type." }));
            return;
        }

        const body = new FormData();
        body.append("name", formData.name);
        body.append("email", formData.email);
        body.append("requestType", formData.requestType);
        body.append("textMessage", formData.textMessage);
        if (isOther && formData.subject) body.append("subject", formData.subject);
        if (attachment) body.append("attachFile", attachment);

        setStatus("sending");
        setFieldErrors({});

        try {
            const res = await fetch("/api/contact", {
                method: "POST",
                body,
            });
            const data = (await res.json().catch(() => ({}))) as ApiErrorBody;

            if (!res.ok || !data.ok) {
                if (data.errors) {
                    const flat: Record<string, string> = {};
                    for (const [k, list] of Object.entries(data.errors)) {
                        flat[k] = Array.isArray(list) ? list[0] : String(list);
                    }
                    setFieldErrors(flat);
                }
                const msg = data.error ?? "Failed to send the message. Please try again.";
                toast.error(msg);
                setStatus("error");
                return;
            }

            setStatus("sent");
            setFormData({ name: "", email: "", requestType: "", subject: "", textMessage: "" });
            clearAttachment();
        } catch (err) {
            console.error("[contact] submit failed:", err);
            toast.error("Network error. Please try again.");
            setStatus("error");
        }
    }

    if (isSent) {
        return (
            <div className="rounded-3xl border border-emerald-500/20 bg-card/80 backdrop-blur-sm p-12 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                    <Send className="w-6 h-6 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-semibold text-foreground mb-2">Message Sent</h2>
                <p className="text-muted-foreground leading-relaxed max-w-md mx-auto">
                    Thank you for reaching out! We&apos;ll get back to you within 24 hours.
                </p>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStatus("idle")}
                    className="mt-6"
                >
                    Send another message
                </Button>
            </div>
        );
    }

    const inputBase =
        "w-full rounded-xl border bg-input/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all";
    const okBorder = "border-blue-500/20 hover:border-blue-500/30";
    const errBorder = "border-red-500/60";

    return (
        <form
            onSubmit={handleSubmit}
            noValidate
            className="rounded-3xl border border-blue-500/20 bg-card/80 backdrop-blur-sm p-8"
        >
            <div className="grid sm:grid-cols-2 gap-6 mb-6">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                        Your name / or company *
                    </label>
                    <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        maxLength={40}
                        value={formData.name}
                        onChange={(e) => update("name", e.target.value)}
                        className={cn(inputBase, fieldErrors.name ? errBorder : okBorder)}
                        placeholder="Your name"
                        disabled={isSending}
                    />
                    {fieldErrors.name && (
                        <p className="mt-1.5 text-xs text-red-400">{fieldErrors.name}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                        Your e-mail *
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        maxLength={70}
                        value={formData.email}
                        onChange={(e) => update("email", e.target.value)}
                        className={cn(inputBase, fieldErrors.email ? errBorder : okBorder)}
                        placeholder="you@example.com"
                        disabled={isSending}
                    />
                    {fieldErrors.email && (
                        <p className="mt-1.5 text-xs text-red-400">{fieldErrors.email}</p>
                    )}
                </div>
            </div>

            <div className="mb-6">
                <label
                    htmlFor="requestType"
                    className="block text-sm font-medium text-foreground mb-2"
                >
                    Type of request *
                </label>
                <Select
                    value={formData.requestType}
                    onValueChange={(value) => update("requestType", value)}
                    disabled={isSending}
                >
                    <SelectTrigger
                        id="requestType"
                        aria-label="Type of request"
                        className={cn(
                            "w-full h-12 rounded-xl border bg-input/30 px-4 text-sm text-foreground transition-all data-placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:border-blue-500/50",
                            fieldErrors.requestType ? errBorder : okBorder,
                        )}
                    >
                        <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                    <SelectContent>
                        {REQUEST_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                                {t.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {fieldErrors.requestType && (
                    <p className="mt-1.5 text-xs text-red-400">{fieldErrors.requestType}</p>
                )}
            </div>

            {isOther && (
                <div className="mb-6">
                    <label htmlFor="subject" className="block text-sm font-medium text-foreground mb-2">
                        Subject *
                    </label>
                    <input
                        id="subject"
                        name="subject"
                        type="text"
                        required
                        maxLength={70}
                        value={formData.subject}
                        onChange={(e) => update("subject", e.target.value)}
                        className={cn(inputBase, fieldErrors.subject ? errBorder : okBorder)}
                        placeholder="What is your request about?"
                        disabled={isSending}
                    />
                    {fieldErrors.subject && (
                        <p className="mt-1.5 text-xs text-red-400">{fieldErrors.subject}</p>
                    )}
                </div>
            )}

            <div className="mb-6">
                <label
                    htmlFor="textMessage"
                    className="block text-sm font-medium text-foreground mb-2"
                >
                    Message *
                </label>
                <textarea
                    id="textMessage"
                    name="textMessage"
                    required
                    maxLength={400}
                    rows={5}
                    value={formData.textMessage}
                    onChange={(e) => update("textMessage", e.target.value)}
                    className={cn(
                        inputBase,
                        "resize-none",
                        fieldErrors.textMessage ? errBorder : okBorder,
                    )}
                    placeholder="Tell us how we can help…"
                    disabled={isSending}
                />
                <div className="flex items-center justify-between mt-1.5">
                    {fieldErrors.textMessage ? (
                        <p className="text-xs text-red-400">{fieldErrors.textMessage}</p>
                    ) : (
                        <span />
                    )}
                    <span className="text-xs text-muted-foreground/70">
                        {formData.textMessage.length}/400
                    </span>
                </div>
            </div>

            <div className="mb-8">
                <label className="block text-sm font-medium text-foreground mb-2">
                    Attach a file (optional)
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSending}
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-blue-500/20 bg-blue-950/50 text-sm text-foreground hover:bg-blue-500/10 hover:border-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Paperclip className="w-4 h-4" />
                        {attachment ? "Replace file" : "Choose file"}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        name="attachFile"
                        accept=".jpg,.jpeg,.png,.zip"
                        className="hidden"
                        onChange={(e) => pickAttachment(e.target.files?.[0] ?? null)}
                    />
                    {attachment && (
                        <div className="inline-flex items-center gap-2 text-sm text-foreground bg-blue-500/10 border border-blue-500/30 rounded-xl px-3 py-1.5">
                            <span className="truncate max-w-[200px]">{attachment.name}</span>
                            <span className="text-muted-foreground/70 text-xs">
                                {(attachment.size / 1024).toFixed(0)} KB
                            </span>
                            <button
                                type="button"
                                onClick={clearAttachment}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Remove file"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
                <p
                    className={cn(
                        "mt-1.5 text-xs",
                        fieldErrors.attachFile ? "text-red-400" : "text-muted-foreground/70",
                    )}
                >
                    {fieldErrors.attachFile ?? "One image (PNG / JPG) or a ZIP archive, max 2 MB."}
                </p>
            </div>

            <Button
                type="submit"
                disabled={isSending}
                className="w-full h-12 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/25 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {isSending ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending…
                    </>
                ) : (
                    "Send Message"
                )}
            </Button>
        </form>
    );
}
