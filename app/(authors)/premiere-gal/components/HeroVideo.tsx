"use client";

import { PlayArrow } from "@mui/icons-material";
import { Box, Button } from "@mui/material";
import { useRef, useState } from "react";
import PaperCard from "./PaperCard";

/** Port of `resources/js/premieregal/components/HeroVideo.jsx`. */
export default function HeroVideo() {
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlayVideo = (state: boolean) => () => {
    setIsPlayingVideo(state);
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.volume = 0.5;
    if (state) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  return (
    <PaperCard sx={{ p: 1 }}>
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: "auto",
          aspectRatio: "16/9",
          borderRadius: "10px",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src="/premiere-gal/assets/hero.jpg"
          alt="Premiere Gal Motionflow"
          width="100%"
          height="100%"
          style={{ position: "absolute", top: 0, left: 0, zIndex: 1, opacity: isPlayingVideo ? 0 : 1, pointerEvents: "none" }}
        />
        <video
          ref={videoRef}
          width="100%"
          height="100%"
          controls
          controlsList="nodownload"
          style={{ position: "absolute", top: 0, left: 0, zIndex: 0, opacity: isPlayingVideo ? 1 : 0, pointerEvents: isPlayingVideo ? "auto" : "none" }}
        >
          <source src="https://cdn.motionflow.pro/public/market/preview/v3_MAX_herovideo.mp4" type="video/mp4" onEnded={togglePlayVideo(false)} />
        </video>
        <Button
          variant="contained"
          sx={{
            zIndex: 2,
            background: "var(--linear-gradient)",
            color: "white",
            borderRadius: "50%",
            p: 1,
            minWidth: "0",
            opacity: isPlayingVideo ? 0 : 1,
            width: "50px",
            height: "50px",
          }}
          onClick={togglePlayVideo(true)}
        >
          <PlayArrow sx={{ fontSize: "32px" }} />
        </Button>
      </Box>
    </PaperCard>
  );
}
