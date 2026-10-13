"use client";

import { useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, IconButton, Link, Stack, TextField, Typography, useColorScheme } from "@mui/material";
import { Paperclip, SendHorizontal, X } from "lucide-react";
import { GAL_CONTACT_ATTACHMENT_ACCEPT, validateGalContactAttachment } from "@/lib/gal-contact-attachment";
import PaperCard from "./PaperCard";
import { useMobile } from "../hooks/use-mobile";

/** Port of `resources/js/premieregal/components/Contact.jsx`. */
export default function Contact() {
  const { mode } = useColorScheme();
  const isMobile = useMobile();
  const [status, setStatus] = useState<"loading" | "success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearAttachment = () => {
    setAttachment(null);
    setAttachmentError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const pickAttachment = (file: File | null) => {
    if (status === "loading" || !file) return;
    const error = validateGalContactAttachment(file);
    setAttachmentError(error ?? "");
    if (!error) setAttachment(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLFormElement>) => {
    if (status === "loading") return;
    for (const item of e.clipboardData.items) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      pickAttachment(file);
      return;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === "loading" || attachmentError) return;
    setStatus("loading");
    setErrorMsg("");
    const form = e.currentTarget;
    const formData = new FormData(form);
    if (attachment) formData.append("attachFile", attachment);

    try {
      const res = await fetch("/api/send-galtoolkit-contact-form", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        if (res.status === 422) {
          const body = await res.json();
          const messages = Object.values(body.errors ?? {}).flat();
          setErrorMsg(messages.join(" "));
        } else {
          setErrorMsg("Something went wrong. Please try again later.");
        }
        setStatus("error");
        return;
      }
      setStatus("success");
      form.reset();
      clearAttachment();
    } catch {
      setErrorMsg("Something went wrong. Please try again later.");
      setStatus("error");
    }
  };

  return (
    <Stack direction="column" gap={2} py={8} id="contact" component="form" onSubmit={handleSubmit} onPaste={handlePaste}>
      <Typography textAlign="center" fontWeight={700} fontSize="clamp(24px, 2vw, 40px)" color="var(--text-color)">
        Need Any Help?
      </Typography>
      <Typography textAlign="center" fontWeight={400} fontSize="clamp(12px, 1vw, 20px)" color="var(--link-color)">
        Contact us anytime, we&apos;re here to assist you
      </Typography>
      <PaperCard
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1rem 0.5rem",
          "& #name, & #email, & div.MuiInputBase-multiline": {
            backgroundColor: mode === "dark" ? "var(--dark-background-color)" : "#e5e6f3",
          },
        }}
      >
        <Stack direction="column" gap={1} sx={{ gridColumn: { xl: "span 1", xs: "span 2" } }}>
          <Typography fontSize="clamp(12px, 1vw, 20px)">Name</Typography>
          <TextField id="name" variant="outlined" fullWidth name="name" placeholder="Your name" />
        </Stack>
        <Stack direction="column" gap={1} sx={{ gridColumn: { xl: "span 1", xs: "span 2" } }}>
          <Typography fontSize="clamp(12px, 1vw, 20px)">Email</Typography>
          <TextField id="email" variant="outlined" fullWidth name="email" placeholder="you@example.com" />
        </Stack>
        <Stack direction="column" gap={1} sx={{ gridColumn: "span 2" }}>
          <Typography fontSize="clamp(12px, 1vw, 20px)">Message</Typography>
          <TextField id="message" variant="outlined" fullWidth multiline rows={4} name="message" placeholder="How can we help you?" />
        </Stack>
        <Stack direction="column" gap={1} sx={{ gridColumn: "span 2", minWidth: 0 }}>
          <Typography id="gal-attachment-label" fontSize="clamp(12px, 1vw, 20px)">Attachment (optional)</Typography>
          <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, minWidth: 0 }}>
            <Button
              type="button"
              variant="outlined"
              startIcon={<Paperclip size={16} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={status === "loading"}
              aria-describedby="gal-attachment-help"
              sx={{ color: "var(--text-color)", borderColor: "var(--mui-palette-divider)", borderRadius: "8px", px: 2, py: 1, fontWeight: 400 }}
            >
              {attachment ? "Replace file" : "Choose file"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={GAL_CONTACT_ATTACHMENT_ACCEPT}
              hidden
              disabled={status === "loading"}
              aria-labelledby="gal-attachment-label"
              onChange={(e) => pickAttachment(e.target.files?.[0] ?? null)}
            />
            {(attachment || attachmentError) && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, maxWidth: "100%" }}>
                {attachment && <>
                  <Typography fontSize="12px" title={attachment.name} aria-live="polite" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                    {attachment.name}
                  </Typography>
                  <Typography fontSize="12px" color="var(--link-color)" sx={{ whiteSpace: "nowrap" }}>
                    {Math.ceil(attachment.size / 1024)} KB
                  </Typography>
                </>}
                <IconButton size="small" aria-label={attachment ? "Remove attachment" : "Clear attachment error"} onClick={clearAttachment} disabled={status === "loading"}>
                  <X size={16} />
                </IconButton>
              </Box>
            )}
          </Box>
          <Typography id="gal-attachment-help" role={attachmentError ? "alert" : undefined} fontSize="12px" color={attachmentError ? "error.main" : "var(--link-color)"}>
            {attachmentError || "PNG, JPG or ZIP, up to 2 MB. You can also paste an image with Ctrl+V."}
          </Typography>
        </Stack>
        <Box sx={{ display: "flex", flexDirection: { xs: "column", xl: "row" }, gap: 2, alignItems: { xs: "stretch", xl: "center" }, justifyContent: "space-between", gridColumn: "span 2", mt: 1 }}>
          <Typography fontSize="12px" color="var(--link-color)">
            Or contact us directly at{" "}
            <Link href="mailto:toolkit@premieregal.com" sx={{ color: "var(--text-color)", textUnderlineOffset: "3px", overflowWrap: "anywhere" }}>
              toolkit@premieregal.com
            </Link>
          </Typography>
          <Button
            fullWidth={isMobile}
            variant="contained"
            type="submit"
            disabled={status === "loading" || Boolean(attachmentError)}
            sx={{
              background: "var(--linear-gradient)",
              px: "2rem",
              py: "8px",
              borderRadius: "8px",
              fontWeight: 400,
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
            }}
          >
            Send Message {status === "loading" ? <CircularProgress size={16} color="inherit" /> : <SendHorizontal width={16} height={16} />}
          </Button>
        </Box>
        <Typography sx={{ gridColumn: "span 2", textAlign: { xs: "center", xl: "right" } }} fontSize={{ xs: "10px", xl: "12px" }} color="var(--link-color)">
          We will get back to you with an answer as soon as possible.
        </Typography>
        {status === "success" && (
          <Alert severity="success" sx={{ gridColumn: "span 2" }}>
            Message sent successfully!
          </Alert>
        )}
        {status === "error" && (
          <Alert severity="error" sx={{ gridColumn: "span 2" }}>
            {errorMsg}
          </Alert>
        )}
      </PaperCard>
    </Stack>
  );
}
