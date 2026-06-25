"use client";

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTS = new Set(["png", "jpg", "jpeg", "zip"]);

interface ApiErrorBody {
  ok?: boolean;
  error?: string;
  errors?: Record<string, string[]>;
}

function attachmentExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ALLOWED_ATTACHMENT_EXTS.has(fromName)) return fromName;

  const mime = file.type.toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime.includes("zip")) return "zip";
  return fromName;
}

function isImageFile(file: File): boolean {
  const ext = attachmentExtension(file);
  return ext === "png" || ext === "jpg" || ext === "jpeg";
}

function validateAttachment(file: File): string | null {
  const ext = attachmentExtension(file);
  if (!ALLOWED_ATTACHMENT_EXTS.has(ext)) {
    return "File must be PNG, JPG/JPEG or ZIP.";
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "File is larger than 2 MB.";
  }
  return null;
}

export function Contact() {
  const [status, setStatus] = useState<Status>("idle");
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    message: false,
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!attachment || !isImageFile(attachment)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachment);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  const errors = {
    name: !form.name.trim() ? "Please enter your name" : "",
    email:
      !form.email.trim()
        ? "Please enter your email"
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
          ? "Please enter a valid email"
          : "",
    message:
      !form.message.trim()
        ? "Please write a message"
        : form.message.trim().length < 10
          ? "Message must be at least 10 characters"
          : "",
  };

  const hasErrors = Object.values(errors).some(Boolean);

  const clearAttachment = () => {
    setAttachment(null);
    setAttachmentError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const pickAttachment = (file: File | null) => {
    if (!file) {
      clearAttachment();
      return;
    }
    const error = validateAttachment(file);
    if (error) {
      setAttachmentError(error);
      return;
    }
    setAttachment(file);
    setAttachmentError("");
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;

      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) return;

      const ext =
        item.type === "image/jpeg"
          ? "jpg"
          : item.type === "image/png"
            ? "png"
            : item.type.split("/")[1] || "png";
      const file = new File([blob], `pasted-image-${Date.now()}.${ext}`, {
        type: item.type,
      });
      pickAttachment(file);
      return;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, message: true });
    if (hasErrors || attachmentError) return;

    setStatus("sending");
    try {
      const body = new FormData();
      body.append("name", form.name.trim());
      body.append("email", form.email.trim());
      body.append("message", form.message.trim());
      if (attachment) body.append("attachFile", attachment);

      const res = await fetch("/api/spunkram-form", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as ApiErrorBody;

      if (!res.ok || !data.ok) {
        if (data.errors?.attachFile?.[0]) {
          setAttachmentError(data.errors.attachFile[0]);
        }
        setStatus("error");
        return;
      }

      setStatus("sent");
      setForm({ name: "", email: "", message: "" });
      setTouched({ name: false, email: false, message: false });
      clearAttachment();
    } catch {
      setStatus("error");
    }
  };

  const inputBase =
    "w-full rounded-xl border bg-surface text-foreground placeholder:text-subtle px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

  return (
    <section id="contact" className="relative py-20">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Contact us
          </h2>
          <p className="mt-2 text-muted">
            Have a question, bug or partnership idea? Drop us a line.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          onPaste={handlePaste}
          noValidate
          className="mt-10 card rounded-2xl p-6 md:p-8"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="contact-name"
                className="block text-xs font-medium text-muted mb-1.5"
              >
                Name
              </label>
              <input
                id="contact-name"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onBlur={() => setTouched({ ...touched, name: true })}
                className={`${inputBase} ${
                  touched.name && errors.name
                    ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/20"
                    : "border-line"
                }`}
                placeholder="Ada Lovelace"
              />
              {touched.name && errors.name && (
                <p className="mt-1.5 text-xs text-red-400">{errors.name}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="contact-email"
                className="block text-xs font-medium text-muted mb-1.5"
              >
                Email
              </label>
              <input
                id="contact-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                onBlur={() => setTouched({ ...touched, email: true })}
                className={`${inputBase} ${
                  touched.email && errors.email
                    ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/20"
                    : "border-line"
                }`}
                placeholder="you@example.com"
              />
              {touched.email && errors.email && (
                <p className="mt-1.5 text-xs text-red-400">{errors.email}</p>
              )}
            </div>
          </div>

          <div className="mt-4">
            <label
              htmlFor="contact-message"
              className="block text-xs font-medium text-muted mb-1.5"
            >
              Message
            </label>
            <textarea
              id="contact-message"
              rows={5}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              onBlur={() => setTouched({ ...touched, message: true })}
              onPaste={handlePaste}
              className={`${inputBase} resize-y min-h-[120px] ${
                touched.message && errors.message
                  ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/20"
                  : "border-line"
              }`}
              placeholder="What would you like to talk about?"
            />
            {touched.message && errors.message && (
              <p className="mt-1.5 text-xs text-red-400">{errors.message}</p>
            )}
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-muted mb-1.5">
              Attachment (optional)
            </label>
            <div className="flex items-start gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={status === "sending"}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-foreground transition hover:border-brand-500/40 hover:bg-brand-500/5 disabled:pointer-events-none disabled:opacity-60"
              >
                <svg
                  className="w-4 h-4 text-muted"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z"
                    clipRule="evenodd"
                  />
                </svg>
                {attachment ? "Replace file" : "Choose file"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.zip,image/png,image/jpeg"
                className="hidden"
                onChange={(e) => pickAttachment(e.target.files?.[0] ?? null)}
              />
              {attachment && (
                <div className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground">
                  {previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover border border-line"
                    />
                  )}
                  <span className="truncate max-w-[180px]">{attachment.name}</span>
                  <span className="text-xs text-subtle">
                    {(attachment.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={clearAttachment}
                    className="text-muted hover:text-foreground transition-colors"
                    aria-label="Remove attachment"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <p
              className={`mt-1.5 text-xs ${
                attachmentError ? "text-red-400" : "text-subtle"
              }`}
            >
              {attachmentError ||
                "PNG or JPG image (paste with Ctrl+V)"}
            </p>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-xs text-subtle">
              Or email us at{" "}
              <a
                href="mailto:spunkramhelp@gmail.com"
                className="text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-foreground"
              >
                spunkramhelp@gmail.com
              </a>
            </p>

            <div className="flex items-center gap-3">
              {status === "sent" && (
                <span className="inline-flex items-center gap-1.5 text-sm text-brand-500">
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Message sent. Thank you!
                </span>
              )}
              {status === "error" && (
                <span className="text-sm text-red-400">
                  Something went wrong. Please try again.
                </span>
              )}
              <button
                type="submit"
                disabled={status === "sending"}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-violet hover:bg-brand-violet-hover text-white font-medium text-sm shadow-[inset_0_1px_0_0_rgb(255_255_255/0.2)] transition-[background-image,box-shadow,opacity] duration-200 disabled:pointer-events-none disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {status === "sending" ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M21 12a9 9 0 11-6.219-8.56"
                        strokeLinecap="round"
                      />
                    </svg>
                    Sending…
                  </>
                ) : (
                  <>
                    Send message
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
