"use client";

import { Box, Stack, Typography, useColorScheme, useTheme } from "@mui/material";
import Links from "./Links";
import PaperCard from "./PaperCard";
import { usePackageVersion } from "../hooks/use-package-version";

/** Port of `resources/js/premieregal/components/AppBar.jsx`. */
export default function GalToolkitAppBar() {
  const { mode } = useColorScheme();
  const version = usePackageVersion();
  const theme = useTheme();
  const backgroundColor = theme.alpha(theme.palette.background.paper, 0.6);
  if (!mode) return null;

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Stack direction="row" gap={2} alignItems="flex-start" width="100%" sx={{ position: "sticky", top: "2rem", zIndex: 99 }}>
      <PaperCard
        onClick={handleScrollToTop}
        sx={{
          p: 1,
          width: { xl: "54px", xs: "46px" },
          height: { xl: "54px", xs: "46px" },
          backdropFilter: "blur(10px)",
          backgroundColor,
          cursor: "pointer",
        }}
      >
        <Box
          sx={{
            aspectRatio: "1/1",
            width: "100%",
            height: "auto",
            backgroundImage: "url(/premiere-gal/assets/logo.png)",
            backgroundSize: "contain",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
      </PaperCard>
      <PaperCard
        sx={{
          width: "fit-content",
          flexGrow: 1,
          justifyContent: "flex-start",
          p: 2,
          height: { xl: "54px", xs: "46px" },
          backdropFilter: "blur(10px)",
          backgroundColor,
        }}
      >
        <Typography
          fontWeight={600}
          fontSize="clamp(14px, 2vw, 20px)"
          color="var(--text-color)"
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          Gal Toolkit MAX{" "}
          <Typography
            component="span"
            fontSize={10}
            fontWeight={600}
            sx={{ background: "var(--linear-gradient)", color: "white", padding: "4px 8px", borderRadius: "99px" }}
          >
            {version}
          </Typography>
        </Typography>
        <Links />
      </PaperCard>
    </Stack>
  );
}
