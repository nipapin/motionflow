"use client";

import { useMediaQuery, useTheme } from "@mui/material";

/** Port of `resources/js/premieregal/hooks/useMobile.jsx`. */
export function useMobile(): boolean {
  const { breakpoints } = useTheme();
  return useMediaQuery(breakpoints.down("md"));
}
