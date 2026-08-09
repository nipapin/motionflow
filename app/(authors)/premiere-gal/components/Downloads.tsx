"use client";

import { Button, Stack, Typography } from "@mui/material";
import { useAuth } from "@/components/auth-provider";
import { MacIcon, WindowsIcon } from "../mac-windows-icons";
import { usePremiereGalPaths } from "../use-premiere-gal-paths";
import PaperCard from "./PaperCard";

/** Port of `resources/js/premieregal/components/Downloads.jsx`. */
export default function Downloads() {
  const { user, openSignIn } = useAuth();
  const paths = usePremiereGalPaths();

  const handleDownload = (e: React.MouseEvent) => {
    if (user) return;
    e.preventDefault();
    openSignIn("signin");
  };

  return (
    <PaperCard
      id="download"
      sx={{
        width: "100%",
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "flex-start",
        gap: 1.25,
        p: { xs: 2, md: 2.25, lg: 2.5 },
      }}
    >
      <Stack gap={0.5} width="100%" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography
          fontWeight={700}
          fontSize={{ xs: 17, md: "clamp(15px, 1.4vw, 20px)" }}
          color="var(--text-color)"
          textAlign="center"
          lineHeight={1.2}
        >
          Download and Start Free
        </Typography>
        <Typography
          fontWeight={400}
          fontSize={{ xs: 12, md: "clamp(11px, 1.05vw, 13px)" }}
          color="var(--link-color)"
          textAlign="center"
          lineHeight={1.4}
        >
          Start using Gal Toolkit MAX free today — install the extension and jump into your first project in minutes.
        </Typography>
      </Stack>

      <Button
        href={paths.download("windows")}
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
        href={paths.download("mac")}
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
    </PaperCard>
  );
}
