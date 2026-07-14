"use client";

import { Box, Typography, useColorScheme, useTheme } from "@mui/material";
import PaperCard from "./PaperCard";

/** Port of `resources/js/premieregal/components/HeroGrid.jsx`. */
export default function HeroGrid() {
  const theme = useTheme();
  const { mode } = useColorScheme();
  return (
    <Box
      sx={{
        display: "grid",
        overflow: "hidden",
        gridTemplateColumns: { xl: "repeat(8, 1fr)", xs: "repeat(4, 1fr)" },
        gridTemplateRows: { xl: "repeat(3, 1fr)", xs: "repeat(6, 1fr)" },
        gap: 1,
      }}
    >
      <PaperCard
        sx={{
          animationDelay: "0.03s",
          gridColumn: "span 4",
          gridRow: "span 3",
          justifyContent: "flex-start",
          alignItems: "flex-start",
          gap: 1,
          flexDirection: "column",
          overflow: "hidden",
          width: "100%",
          pb: 0,
        }}
      >
        <Typography fontWeight={700} fontSize={20} color="var(--text-color)" whiteSpace="pre-line">
          {`Everything you need\nin one Toolkit`}
        </Typography>
        <Typography fontWeight={400} fontSize={12} color={mode === "light" ? "var(--link-color)" : "#ffffff80"}>
          All the tools you need to speed up your editing workflow in one place. Access transitions, titles,
          graphics, and ready-to-use assets designed for modern content creation. Quickly browse, preview, and
          apply elements directly to your timeline without interrupting your creative flow.
        </Typography>
        <Box height="1rem" />
        <Box
          width="calc(100% + 16px)"
          height="auto"
          alignSelf="flex-end"
          sx={{
            aspectRatio: "556/463",
            backgroundImage: "url(/premiere-gal/assets/extension.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center top",
            backgroundRepeat: "no-repeat",
            transform: "translateX(16px)",
            borderRadius: "10px 0 0 0",
          }}
        />
      </PaperCard>
      <PaperCard
        sx={{
          animationDelay: "0.06s",
          gridColumn: "span 2",
          gridRow: "span 1",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          gap: 1,
          flexDirection: "column",
          width: "100%",
          height: "auto",
          maxHeight: "202px",
          backgroundImage: "url(/premiere-gal/assets/apps.png)",
          backgroundSize: "65%",
          backgroundPosition: "bottom",
          backgroundRepeat: "no-repeat",
        }}
      >
        <Typography fontWeight={700} fontSize="clamp(16px, 2vw, 24px)" color="var(--text-color)" whiteSpace="pre-line">
          {`Works with both\nsoftwares`}
        </Typography>
      </PaperCard>
      <PaperCard
        sx={{
          animationDelay: "0.09s",
          gridColumn: "span 2",
          gridRow: "span 1",
          alignItems: "flex-start",
          gap: 1,
          flexDirection: "column",
          position: "relative",
          justifyContent: "flex-start",
          width: "100%",
          height: "auto",
          maxHeight: "202px",
          backgroundImage: "url(/premiere-gal/assets/updates.png)",
          backgroundSize: "70%",
          backgroundPosition: { md: "90px 20px", xs: "60px 30px" },
          backgroundRepeat: "no-repeat",
        }}
      >
        <Typography fontWeight={700} fontSize="clamp(16px, 2vw, 24px)" color="var(--text-color)" whiteSpace="pre-line">
          {`Regular\nUpdates`}
        </Typography>
      </PaperCard>
      <PaperCard
        sx={{
          animationDelay: "0.12s",
          gridColumn: "span 4",
          gridRow: "span 1",
          position: "relative",
          p: 0,
          backgroundImage: "url(/premiere-gal/assets/editing-assets.png)",
          backgroundSize: "cover",
          backgroundPosition: "bottom",
          backgroundRepeat: "no-repeat",
          width: "100%",
          height: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography
          fontWeight={900}
          fontSize="clamp(60px, 4vw, 90px)"
          sx={{
            background: "var(--linear-gradient)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          2500+
        </Typography>
        <Typography fontWeight={500} fontSize="clamp(14px, 2vw, 20px)" color="var(--text-color)" sx={{ textAlign: "center", mt: "auto", mb: "1rem" }}>
          Editing Assets
        </Typography>
      </PaperCard>
      <PaperCard
        sx={{
          animationDelay: "0.15s",
          gridColumn: "span 2",
          gridRow: "span 1",
          width: "100%",
          height: "100%",
          backgroundImage: "url(/premiere-gal/assets/apply.png)",
          backgroundSize: { xl: "cover", xs: "100%" },
          backgroundPosition: { xl: "center top", xs: "center 0px" },
          backgroundRepeat: "no-repeat",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          position: "relative",
          backgroundColor: "transparent",
          overflow: "hidden",
          "&::before": {
            content: '""',
            width: "80%",
            height: "50%",
            left: "50%",
            top: 0,
            position: "absolute",
            transform: "translateX(-50%)",
            borderRadius: "0 0 10px 10px",
            background:
              mode === "dark" ? "linear-gradient(to top, #2c2839, transparent)" : "linear-gradient(to top, #dfe2fb, transparent)",
            zIndex: -1,
          },
          "&::after": {
            content: '""',
            display: mode === "light" ? "block" : "none",
            position: "absolute",
            width: "100%",
            height: "100%",
            background: theme.palette.background.paper,
            zIndex: -2,
            left: 0,
            top: 0,
          },
        }}
      >
        <Typography fontWeight={700} fontSize="clamp(16px, 2vw, 24px)" color="var(--text-color)" whiteSpace="pre-line">
          {`Apply in\none click`}
        </Typography>
      </PaperCard>
      <PaperCard
        sx={{
          animationDelay: "0.18s",
          gridColumn: "span 2",
          gridRow: "span 1",
          width: "100%",
          height: "auto",
          backgroundImage: "url(/premiere-gal/assets/support.png)",
          backgroundSize: { xl: "140px 140px", xs: "100px 100px" },
          backgroundPosition: "90% 90%",
          backgroundRepeat: "no-repeat",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
        }}
      >
        <Typography fontWeight={700} fontSize="clamp(16px, 2vw, 24px)" color="var(--text-color)" whiteSpace="pre-line">
          {`Fast\nSupport`}
        </Typography>
      </PaperCard>
    </Box>
  );
}
