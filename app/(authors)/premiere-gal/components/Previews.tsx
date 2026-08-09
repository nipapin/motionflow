"use client";

import { Box, Button, MenuItem, Select, Skeleton, Stack, Typography, useColorScheme, useScrollTrigger, useTheme, type SelectChangeEvent } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { OpenInNew } from "@mui/icons-material";
import { useMobile } from "../hooks/use-mobile";

const sections = [
  { id: 1, title: "Transitions" },
  { id: 2, title: "Titles" },
  { id: 3, title: "Lower Thirds" },
  { id: 4, title: "Backgrounds" },
  { id: 5, title: "Overlays" },
];

const skeletonPreviews = Array(12).fill(0);

const gridSx = {
  display: "grid",
  gridTemplateColumns: { xl: "repeat(4, 1fr)", xs: "repeat(2, 1fr)" },
  gap: 1,
} as const;

/** Port of `resources/js/premieregal/components/Previews.jsx`. */
export default function Previews() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    setHash(window.location.hash);
  }, []);
  const trigger = useScrollTrigger({ target: typeof window !== "undefined" ? window : undefined, disableHysteresis: true, threshold: hash ? 0 : 2000 });
  const [current, setCurrent] = useState(sections[0]);
  const [previews, setPreviews] = useState<Record<number, string[]> | null>(null);
  const { mode } = useColorScheme();
  const theme = useTheme();
  const activeLayerRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobile();

  const handleClick = (section: (typeof sections)[number]) => () => {
    setCurrent(section);
  };

  const handleChange = (e: SelectChangeEvent<number>) => {
    const id = Number(e.target.value);
    const section = sections.find((s) => s.id === id);
    if (section) setCurrent(section);
  };

  useEffect(() => {
    if (previews || !trigger) return;
    const fetchPreviews = async () => {
      const fetchedPreviews: Record<number, string[]> = {};
      for (const section of sections) {
        const response = await fetch(`/api/get-galtoolkit-showcase?section=${section.title}`);
        const { items } = await response.json();
        fetchedPreviews[section.id] = items;
      }
      setPreviews(fetchedPreviews);
    };
    fetchPreviews();
  }, [previews, trigger]);

  useEffect(() => {
    if (!previews) return;
    const root = activeLayerRef.current;
    if (!root) return;
    const videos = root.querySelectorAll<HTMLVideoElement>("video.package-preview");
    videos.forEach((video, index) => {
      video.classList.remove("slideup");
      void video.offsetHeight;
      video.classList.add("slideup");
      video.style.animationDelay = `${index * 0.03}s`;
    });
  }, [current.id, previews]);

  return (
    <Stack direction="column" gap={2} justifyContent="center" py={8}>
      <Stack gap={1} direction="row" alignItems="center" justifyContent="center" display={{ xs: "none", xl: "flex" }}>
        {sections.map((section) => (
          <Button
            key={section.id}
            disableElevation
            variant="contained"
            sx={{
              background: section.id === current.id ? "var(--linear-gradient)" : mode === "dark" ? "var(--dark-background-color)" : "var(--background-color)",
              py: "12px",
              borderRadius: "8px",
              fontWeight: 400,
            }}
            onClick={handleClick(section)}
          >
            <Typography fontWeight={400} fontSize={12} color={section.id === current.id ? "white" : mode === "dark" ? "white" : "inherit"}>
              {section.title}
            </Typography>
          </Button>
        ))}
        <Button disableElevation variant="contained" sx={{ background: "var(--linear-gradient)", py: "12px", borderRadius: "8px", fontWeight: 400 }} href="/showcase" target="_blank">
          <Typography fontWeight={400} fontSize={12} color="white" display="flex" alignItems="center" gap={1}>
            View All <OpenInNew fontSize="small" />
          </Typography>
        </Button>
      </Stack>
      <Box display={{ xs: "flex", xl: "none" }} gap={1} alignItems="center" justifyContent="space-between">
        <Select
          sx={{
            width: "50%",
            color: theme.palette.text.primary,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.23)" : undefined },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.4)" : undefined },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.5)" : undefined },
            "& .MuiSelect-select": { color: theme.palette.text.primary, backgroundColor: theme.palette.background.paper },
            "& .MuiSvgIcon-root": { color: theme.palette.text.secondary },
          }}
          size="small"
          value={current.id}
          onChange={handleChange}
          color="primary"
          inputProps={{ "aria-label": "Preview category" }}
          MenuProps={{
            disableScrollLock: true,
            slotProps: { paper: { sx: { maxHeight: 320, bgcolor: "background.paper" } } },
            sx: { zIndex: theme.zIndex.modal },
          }}
        >
          {sections.map((section) => (
            <MenuItem key={section.id} value={section.id}>
              {section.title}
            </MenuItem>
          ))}
        </Select>
        <Button disableElevation variant="contained" sx={{ background: "var(--linear-gradient)", py: "12px", borderRadius: "8px", fontWeight: 400 }} href="/showcase" target="_blank">
          <Typography fontWeight={400} fontSize={12} color="white" whiteSpace="nowrap">
            View All Previews
          </Typography>
        </Button>
      </Box>
      <Box sx={{ position: "relative", overflow: "hidden" }}>
        {previews
          ? sections.map((section) => {
              const items = previews[section.id] ?? [];
              const isActive = section.id === current.id;
              return (
                <Box
                  key={section.id}
                  ref={isActive ? activeLayerRef : undefined}
                  sx={{
                    ...gridSx,
                    ...(isActive
                      ? { position: "relative", zIndex: 1, opacity: 1, pointerEvents: "auto" }
                      : { position: "absolute", top: 0, left: 0, right: 0, width: "100%", zIndex: 0, opacity: 0, pointerEvents: "none" }),
                  }}
                >
                  {items.slice(0, 12).map((preview, index, self) => {
                    if (isMobile && index >= self.length / 2) return null;
                    const src =
                      preview.startsWith("http://") ||
                      preview.startsWith("https://") ||
                      preview.startsWith("/")
                        ? preview
                        : `/${preview}`;
                    return (
                      <video
                        key={`${section.id}-${index}-${preview}`}
                        autoPlay
                        playsInline
                        muted
                        loop
                        preload="auto"
                        className="package-preview slideup"
                        style={{ animationDelay: `${index * 0.03}s` }}
                      >
                        <source src={src} type="video/webm" />
                      </video>
                    );
                  })}
                </Box>
              );
            })
          : (
            <Box sx={{ ...gridSx, overflow: "hidden" }}>
              {skeletonPreviews.map((_, index) => (
                <Skeleton
                  key={index}
                  variant="rectangular"
                  width="100%"
                  height="100%"
                  sx={{ aspectRatio: "16/9", width: "100%", height: "auto", borderRadius: "10px", animationDelay: `${index * 0.1}s` }}
                />
              ))}
            </Box>
          )}
      </Box>
    </Stack>
  );
}
