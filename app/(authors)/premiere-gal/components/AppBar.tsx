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
    <Stack
      direction="row"
      gap={{ xs: 1, md: 1.5, lg: 2 }}
      alignItems="stretch"
      width="100%"
      sx={{ position: "sticky", top: "2rem", zIndex: 99, minWidth: 0 }}
    >
      <PaperCard
        onClick={handleScrollToTop}
        sx={{
          p: 1,
          width: { xs: "42px", md: "46px", xl: "54px" },
          height: { xs: "42px", md: "46px", xl: "54px" },
          flexShrink: 0,
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
          width: "100%",
          minWidth: 0,
          flexGrow: 1,
          justifyContent: "flex-start",
          alignItems: "center",
          flexWrap: "nowrap",
          gap: { xs: 1, md: 1, lg: 1.5, xl: 2 },
          px: { xs: 1.25, md: 1.5, lg: 2 },
          py: 1,
          minHeight: { xs: "42px", md: "46px", xl: "54px" },
          height: "auto",
          backdropFilter: "blur(10px)",
          backgroundColor,
        }}
      >
        <Typography
          fontWeight={600}
          fontSize="clamp(12px, 1.35vw, 20px)"
          color="var(--text-color)"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 0.5, md: 0.75, lg: 1 },
            whiteSpace: "nowrap",
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          Gal Toolkit MAX{" "}
          <Typography
            component="span"
            fontSize="clamp(8px, 0.85vw, 10px)"
            fontWeight={600}
            sx={{
              background: "var(--linear-gradient)",
              color: "white",
              padding: { xs: "2px 6px", md: "3px 7px", lg: "4px 8px" },
              borderRadius: "99px",
              flexShrink: 0,
            }}
          >
            {version}
          </Typography>
        </Typography>
        <Links />
      </PaperCard>
    </Stack>
  );
}
