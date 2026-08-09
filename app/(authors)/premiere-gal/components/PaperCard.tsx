"use client";

import { Paper, useColorScheme, type SxProps, type Theme } from "@mui/material";
import type { ReactNode, MouseEventHandler } from "react";

/** Port of `resources/js/premieregal/components/PaperCard.jsx`. */
export default function PaperCard({
  id,
  sx,
  children,
  className,
  onClick,
}: {
  id?: string;
  sx?: SxProps<Theme>;
  children?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler;
}) {
  const { mode } = useColorScheme();
  if (!mode) return null;
  return (
    <Paper
      id={id}
      elevation={0}
      onClick={onClick}
      variant={mode === "dark" ? "outlined" : "elevation"}
      className={className}
      sx={{
        minWidth: 0,
        px: "16px",
        py: "16px",
        borderRadius: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...sx,
      }}
    >
      {children}
    </Paper>
  );
}
