"use client";

import { Box, Button, Typography, useColorScheme } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import PaperCard from "./PaperCard";
import VideoContainer from "./VideoContainer";

const gifs = [
  { id: 1, label: "Transitions", src: "/premiere-gal/assets/video/transitions.mp4", span: 3 },
  { id: 2, label: "Motion Graphics", src: "/premiere-gal/assets/video/motiongraphics.mp4", span: 3 },
  { id: 3, label: "Effects & Overlays", src: "/premiere-gal/assets/video/effects.mp4", span: 4 },
  { id: 4, label: "Sound FX", src: "/premiere-gal/assets/video/soundfx.mp4", span: 2 },
  { id: 5, label: "Scripts", src: "/premiere-gal/assets/video/scripts.mp4", span: 3 },
  { id: 6, label: "Stock", src: "/premiere-gal/assets/video/assets.mp4", span: 3 },
];

function PreviewVideo({ src, active }: { src: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    el.currentTime = 0;
    el.play().catch(() => {});
  }, [active, src]);

  return <video ref={ref} src={src} autoPlay playsInline loop muted />;
}

/** Port of `resources/js/premieregal/components/Gifs.jsx`. */
export default function Gifs() {
  const [currentGif, setCurrentGif] = useState(gifs[0]);
  const { mode } = useColorScheme();
  const handleClick = (gif: (typeof gifs)[number]) => () => {
    setCurrentGif(gif);
  };

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xl: "repeat(8, 1fr)", xs: "repeat(4, 1fr)" }, gap: 2, py: 8 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, gridColumn: { md: "span 3", xs: "span 4" } }}>
        <Typography fontWeight={700} fontSize="clamp(28px, 2vw, 40px)">
          {`Everything you\nneed for editing at\nyour fingertips`}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1 }}>
          {gifs.map((gif, index) => {
            const isActive = gif.id === currentGif.id;
            return (
              <Button
                disableElevation
                key={gif.id}
                variant="contained"
                sx={{
                  animationDelay: `${index * 0.03}s`,
                  background: isActive ? "var(--linear-gradient)" : mode === "dark" ? "var(--dark-background-color)" : "var(--background-color)",
                  py: "12px",
                  borderRadius: "8px",
                  fontWeight: 400,
                  gridColumn: `span ${gif.span}`,
                  color: mode === "dark" ? "white" : "inherit",
                }}
                onClick={handleClick(gif)}
              >
                <Typography fontWeight={700} fontSize={16} color={isActive ? "white" : "var(--text-color)"}>
                  {gif.label}
                </Typography>
              </Button>
            );
          })}
        </Box>
      </Box>
      <PaperCard sx={{ gridColumn: { md: "span 5", xs: "span 4" }, padding: 0, position: "relative", aspectRatio: "16/9", overflow: "hidden" }}>
        {gifs.map((gif) => {
          const isCurrentGif = currentGif.id === gif.id;
          return (
            <VideoContainer
              key={gif.id}
              sx={{ position: "absolute", top: 0, left: 0, width: "100%", height: "auto", opacity: Number(isCurrentGif) }}
            >
              <PreviewVideo src={gif.src} active={isCurrentGif} />
            </VideoContainer>
          );
        })}
      </PaperCard>
    </Box>
  );
}
