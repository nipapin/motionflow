"use client";

import { Menu } from "@mui/icons-material";
import { Box, Drawer, IconButton, Typography, useScrollTrigger } from "@mui/material";
import { useState } from "react";
import FolderTree from "./FolderTree";
import PreviewGrid from "./PreviewGrid";
import PreviewSkeleton from "./PreviewSkeleton";
import { ShowcaseProvider } from "./ShowcaseProvider";
import { useShowcase } from "./use-showcase";
import type { ShowcaseNode } from "../showcase-types";

/** Port of `resources/js/premieregalassets/components/ShowcaseNavigation.jsx`. */
export default function ShowcaseNavigation({ tree }: { tree: ShowcaseNode[] }) {
  return (
    <ShowcaseProvider tree={tree}>
      <ShowcaseLayout />
    </ShowcaseProvider>
  );
}

function ShowcaseLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { isPending } = useShowcase();
  const trigger = useScrollTrigger({ threshold: 300 });

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { md: "400px 1fr", xs: "1fr" }, gap: "1rem", width: "100%", height: "100%", minHeight: 0 }}>
      <Box
        sx={{
          display: { xs: "flex", md: "none" },
          alignItems: "center",
          justifyContent: "space-between",
          p: "1rem",
          position: trigger ? "fixed" : "relative",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1,
          background: "var(--background)",
        }}
      >
        <Typography fontWeight={400} fontSize="1.25rem">
          Select Category
        </Typography>
        <IconButton onClick={() => setDrawerOpen(true)}>
          <Menu />
        </IconButton>
      </Box>
      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)} slotProps={{ paper: { elevation: 0, sx: { width: "70vw" } } }}>
        <Box sx={{ overflowY: "auto", "&::-webkit-scrollbar": { display: "none" } }}>
          <FolderTree />
        </Box>
      </Drawer>
      <Box sx={{ overflowY: "auto", minHeight: 0, display: { xs: "none", md: "block" }, pr: "4px" }}>
        <FolderTree />
      </Box>
      <Box sx={{ overflowY: "auto", minHeight: 0 }}>{isPending ? <PreviewSkeleton /> : <PreviewGrid />}</Box>
    </Box>
  );
}
