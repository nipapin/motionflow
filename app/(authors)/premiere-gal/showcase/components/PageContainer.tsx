import { Box, type BoxProps } from "@mui/material";

/** Port of `resources/js/premieregalassets/components/PageContainer.jsx`. */
export default function PageContainer(props: BoxProps) {
  return (
    <Box
      {...props}
      sx={{
        width: "100%",
        maxWidth: "1280px",
        height: "100vh",
        maxHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        mx: "auto",
        px: { xl: "2px", md: "2rem", xs: "1rem" },
        py: { md: "2rem", xs: "1rem" },
        gap: { md: "2rem", xs: "1rem" },
        overflow: "hidden",
        overflowX: "hidden",
        ...props.sx,
      }}
    >
      {props.children}
    </Box>
  );
}
