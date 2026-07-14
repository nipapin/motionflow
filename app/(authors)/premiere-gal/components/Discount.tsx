"use client";

import { Box, Stack, Typography, useColorScheme } from "@mui/material";
import { LocalOffer, Celebration } from "@mui/icons-material";
import { useDiscount } from "../hooks/use-discount";
import { usePageSets } from "../page-sets-context";

/** Port of `resources/js/premieregal/components/Discount.jsx`. */
export default function Discount() {
  const showDiscount = useDiscount();
  const pageSets = usePageSets();
  const { mode } = useColorScheme();
  if (!mode || !showDiscount) return null;

  const pct = typeof pageSets.discount_percent === "number" ? pageSets.discount_percent : 50;
  const isBeta = pageSets.is_beta_tester === true;

  return (
    <Box sx={{ position: "relative", overflow: "hidden", borderRadius: "16px", background: "var(--linear-gradient)", p: "1px" }}>
      <Box
        sx={{
          borderRadius: "15px",
          background:
            mode === "dark"
              ? "linear-gradient(135deg, rgba(108,20,207,0.85) 0%, rgba(44,40,57,0.95) 100%)"
              : "linear-gradient(135deg, rgba(222,122,190,0.85) 0%, rgba(108,20,207,0.80) 100%)",
          px: 2.5,
          py: 2,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box sx={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.1)", pointerEvents: "none" }} />
        <Box sx={{ position: "absolute", bottom: -12, left: -12, width: 50, height: 50, borderRadius: "50%", background: "rgba(255,255,255,0.08)", pointerEvents: "none" }} />

        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            sx={{
              flexShrink: 0,
              width: 44,
              height: 44,
              borderRadius: "12px",
              background: "var(--linear-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            }}
          >
            <LocalOffer sx={{ color: "#fff", fontSize: 22 }} />
          </Box>

          <Stack gap={0.25} sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap={0.5}>
              <Typography fontWeight={800} fontSize={22} sx={{ color: "#fff", lineHeight: 1.2 }}>
                {pct}% OFF
              </Typography>
              <Celebration sx={{ fontSize: 18, color: "rgba(255,255,255,0.85)" }} />
            </Stack>
            <Typography fontWeight={500} fontSize={12} color="rgba(255,255,255,0.75)" lineHeight={1.4}>
              {isBeta
                ? "Beta tester discount applied for first year or lifetime plan"
                : "Gal Toolkit owner discount applied for first year or lifetime plan"}
            </Typography>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
