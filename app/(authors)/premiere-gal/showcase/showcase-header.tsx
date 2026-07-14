"use client";

import { ArrowBackIosNew, DarkMode, LightMode } from "@mui/icons-material";
import { Box, Button, IconButton, useColorScheme } from "@mui/material";

/** Port of the header bar in `resources/js/premieregalassets/App.jsx`. */
export default function ShowcaseHeader() {
  const { mode, setMode } = useColorScheme();

  const handleToggleMode = () => {
    setMode(mode === "light" ? "dark" : "light");
  };

  return (
    <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
      <Button
        startIcon={<ArrowBackIosNew />}
        href="/"
        sx={{
          color: mode === "dark" ? "white" : "black",
          "&:hover": {
            textDecoration: "none",
            color: mode === "dark" ? "primary.main" : "secondary.main",
          },
        }}
      >
        Back to Gal Toolkit MAX
      </Button>
      <IconButton size="small" onClick={handleToggleMode}>
        {mode === "light" ? <DarkMode fontSize="small" /> : <LightMode fontSize="small" />}
      </IconButton>
    </Box>
  );
}
