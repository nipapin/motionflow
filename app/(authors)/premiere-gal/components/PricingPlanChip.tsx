"use client";

import { Box, Typography, useColorScheme } from "@mui/material";
import type { PricingPlanEntry } from "../entities/pricing";

/** Port of `resources/js/premieregal/components/PricingPlanChip.jsx`. */
export default function PricingPlanChip({ plan }: { plan: PricingPlanEntry }) {
  const { mode } = useColorScheme();
  if (!plan.chip) return null;

  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        right: 0,
        transform: "translate(10%, -50%)",
        textWrap: "nowrap",
        color: mode === "dark" ? "black" : "white",
        background: mode === "dark" ? "white" : "var(--dark-background-color)",
        zIndex: 1,
        p: "2px 4px",
        borderRadius: "8px",
      }}
    >
      <Typography fontWeight={400} fontSize={8}>
        {plan.chip}
      </Typography>
    </Box>
  );
}
