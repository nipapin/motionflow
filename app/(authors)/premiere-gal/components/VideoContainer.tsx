import { Box, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

/** Port of `resources/js/premieregal/components/VideoContainer.jsx`. */
export default function VideoContainer({ children, sx }: { children?: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box
      sx={[
        {
          aspectRatio: "16/9",
          width: "100%",
          height: "auto",
          backgroundColor: "#a3a3a3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "10px",
          overflow: "hidden",
          padding: 0,
          "& video": { width: "100%" },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
