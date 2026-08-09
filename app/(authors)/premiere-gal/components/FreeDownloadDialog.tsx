"use client";

import { Close } from "@mui/icons-material";
import { Button, Dialog, DialogContent, IconButton, Stack, Typography, useColorScheme } from "@mui/material";
import { useAuth } from "@/components/auth-provider";
import { MacIcon, WindowsIcon } from "../mac-windows-icons";

type FreeDownloadDialogProps = {
  open: boolean;
  onClose: () => void;
};

export default function FreeDownloadDialog({ open, onClose }: FreeDownloadDialogProps) {
  const { user, openSignIn } = useAuth();
  const { mode } = useColorScheme();

  const handleDownload = (e: React.MouseEvent) => {
    if (user) return;
    e.preventDefault();
    onClose();
    openSignIn("signin");
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: "16px",
            backgroundColor: mode === "dark" ? "var(--dark-background-color)" : "background.paper",
            backgroundImage: "none",
            p: 0.5,
          },
        },
      }}
    >
      <DialogContent sx={{ p: { xs: 2.5, sm: 3 }, position: "relative" }}>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          size="small"
          sx={{ position: "absolute", top: 8, right: 8, color: "var(--link-color)" }}
        >
          <Close fontSize="small" />
        </IconButton>

        <Stack gap={1.5} width="100%" alignItems="stretch">
          <Stack gap={0.75} width="100%" alignItems="center" pr={3}>
            <Typography
              fontWeight={700}
              fontSize={{ xs: 18, sm: 20 }}
              color="var(--text-color)"
              textAlign="center"
              lineHeight={1.25}
            >
              Download and Start Free
            </Typography>
            <Typography
              fontWeight={400}
              fontSize={13}
              color="var(--link-color)"
              textAlign="center"
              lineHeight={1.5}
            >
              Just install the extension and open it in Premiere Pro or After Effects — the free pack will be
              installed automatically.
            </Typography>
          </Stack>

          <Button
            href="/download/windows"
            onClick={handleDownload}
            fullWidth
            variant="contained"
            sx={{ background: "var(--linear-gradient)", py: "12px", borderRadius: "8px", fontWeight: 400 }}
          >
            <Typography
              fontWeight={400}
              fontSize={13}
              color="white"
              sx={{ display: "inline-flex", alignItems: "center", gap: 1, lineHeight: 1 }}
            >
              <WindowsIcon /> Download for Windows
            </Typography>
          </Button>
          <Button
            href="/download/mac"
            onClick={handleDownload}
            fullWidth
            variant="contained"
            sx={{ background: "var(--dark-background-color)", py: "12px", borderRadius: "8px", fontWeight: 400 }}
          >
            <Typography
              fontWeight={400}
              fontSize={13}
              color="white"
              sx={{ display: "inline-flex", alignItems: "center", gap: 1, lineHeight: 1 }}
            >
              <MacIcon /> Download for Mac
            </Typography>
          </Button>

          <Typography
            component="a"
            href="#use"
            onClick={(e) => {
              e.preventDefault();
              onClose();
              document.getElementById("use")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            fontWeight={500}
            fontSize={13}
            textAlign="center"
            sx={{
              mt: 0.5,
              color: "var(--link-color)",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
              cursor: "pointer",
              "&:hover": { opacity: 0.8 },
            }}
          >
            How to install the extension
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
