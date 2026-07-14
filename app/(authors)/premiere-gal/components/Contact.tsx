"use client";

import { useState } from "react";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography, useColorScheme } from "@mui/material";
import { Send, SendHorizontal } from "lucide-react";
import PaperCard from "./PaperCard";
import { useMobile } from "../hooks/use-mobile";

/** Port of `resources/js/premieregal/components/Contact.jsx`. */
export default function Contact() {
  const { mode } = useColorScheme();
  const isMobile = useMobile();
  const [status, setStatus] = useState<"loading" | "success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    const form = e.currentTarget;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
      const res = await fetch("/api/send-galtoolkit-contact-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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
    } catch {
      setErrorMsg("Something went wrong. Please try again later.");
      setStatus("error");
    }
  };

  return (
    <Stack direction="column" gap={2} py={8} id="contact" component="form" onSubmit={handleSubmit}>
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
        <Box sx={{ display: "flex", flexDirection: { xs: "column", xl: "row" }, gap: 1, alignItems: "center", justifyContent: "space-between", gridColumn: "span 2" }}>
          <Button
            fullWidth={isMobile}
            variant="contained"
            type="submit"
            disabled={status === "loading"}
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
          <Typography fontSize={{ xs: "10px", xl: "12px" }} color="var(--link-color)">
            We will get back to you with an answer as soon as possible.
          </Typography>
        </Box>
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
