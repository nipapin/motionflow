"use client";

import { Box, Stack, Typography } from "@mui/material";
import { useBlackFridayCountdown } from "../hooks/use-black-friday";

export default function BlackFridayBanner() {
  const { phase, secondsLeft } = useBlackFridayCountdown();
  if (phase === "inactive") return null;

  const units = [
    ["Days", Math.floor(secondsLeft / 86400)],
    ["Hours", Math.floor(secondsLeft / 3600) % 24],
    ["Minutes", Math.floor(secondsLeft / 60) % 60],
    ["Seconds", secondsLeft % 60],
  ] as const;
  const countdownLabel = "Sale ends in";

  return (
    <Box
      component="section"
      aria-label="Black Friday Sale"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: { xs: 2, sm: 2.5 },
        px: { xs: 2, sm: 3 },
        py: { xs: 2, sm: 2.5 },
        border: "1px solid #ffffff24",
        borderRadius: "16px",
        color: "#fff8fc",
        background: "radial-gradient(ellipse at 100% 0%, #702a76 0, transparent 70%), linear-gradient(105deg, #15121e 8%, #34204b 100%)",
      }}
    >
      <Stack gap={0.75}>
        <Typography component="h2" fontSize="clamp(24px, 3vw, 38px)" fontWeight={800} letterSpacing="-0.045em">
          Black Friday Sale!
        </Typography>
        <Typography fontSize={{ xs: 14, sm: 16 }} color="#efc9ee">
          Up to <Box component="strong" sx={{ color: "#fff8fc" }}>40% off</Box> plans
        </Typography>
      </Stack>

      <Stack gap={0.75} sx={{ flex: { xs: "1 1 15rem", sm: "0 1 15rem" }, minWidth: 0, maxWidth: "100%" }}>
        <Typography fontSize={11} fontWeight={600} color="#f7dbf5">
          {countdownLabel}
        </Typography>
        <Box role="timer" aria-label={countdownLabel} sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 0.75 }}>
          {units.map(([label, value]) => (
            <Stack key={label} alignItems="center" gap={0.5} sx={{ border: "1px solid #ffffff2b", background: "#100c1e66", borderRadius: "8px", py: 0.75 }}>
              <Typography component="span" fontWeight={700} fontSize={22} sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                {String(value).padStart(2, "0")}
              </Typography>
              <Typography component="span" fontSize={10} color="#f7dbf5">{label}</Typography>
            </Stack>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
