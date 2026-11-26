"use client";

import { Box, Typography, useColorScheme } from "@mui/material";

/** Port of `resources/js/premieregal/components/PricingPlanChip.jsx`. */
export default function PricingPlanChip({ label, promotional }: { label: string; promotional: boolean }) {
  const { mode } = useColorScheme();

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
        p: promotional ? "3px 6px" : "2px 4px",
        borderRadius: "8px",
      }}
    >
      <Typography fontWeight={promotional ? 500 : 400} fontSize={promotional ? 10 : 8}>
        {label}
      </Typography>
    </Box>
  );
}
