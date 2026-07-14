"use client";

import { Button, Typography } from "@mui/material";
import { useAuth } from "@/components/auth-provider";
import { useMobile } from "../hooks/use-mobile";
import { MacIcon, WindowsIcon } from "../mac-windows-icons";
import PaperCard from "./PaperCard";

/** Port of `resources/js/premieregal/components/Downloads.jsx`. */
export default function Downloads() {
  const isMobile = useMobile();
  const { user, openSignIn } = useAuth();
  const width = isMobile ? "100%" : "25rem";

  const handleDownload = (e: React.MouseEvent) => {
    if (user) return;
    e.preventDefault();
    openSignIn("signin");
  };

  return (
    <PaperCard sx={{ width, flexDirection: "column", gap: 1 }}>
      <Typography fontWeight={700} fontSize={16} color="var(--text-color)" textAlign="center">
        Download Gal Toolkit Installer
      </Typography>
      <Button
        href="/download/windows"
        onClick={handleDownload}
        fullWidth
        variant="contained"
        sx={{ background: "var(--linear-gradient)", py: "8px", borderRadius: "8px", fontWeight: 400 }}
      >
        <Typography fontWeight={400} fontSize={12} color="white" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WindowsIcon /> Download for Windows
        </Typography>
      </Button>
      <Button
        href="/download/mac"
        onClick={handleDownload}
        fullWidth
        variant="contained"
        sx={{ background: "var(--dark-background-color)", py: "8px", borderRadius: "8px", fontWeight: 400 }}
      >
        <Typography fontWeight={400} fontSize={12} color="white" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <MacIcon /> Download for Mac
        </Typography>
      </Button>
    </PaperCard>
  );
}
