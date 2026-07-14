"use client";

import { CssBaseline, ThemeProvider } from "@mui/material";
import type { ReactNode } from "react";
import { premiereGalTheme } from "./theme";

export function PremiereGalThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={premiereGalTheme} defaultMode="light">
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
