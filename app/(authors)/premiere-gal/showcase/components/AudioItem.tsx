"use client";

import { MusicNote } from "@mui/icons-material";
import { CircularProgress, Paper } from "@mui/material";
import { useRef, useState } from "react";
import type { ShowcaseNode } from "../showcase-types";

/** Port of `resources/js/premieregalassets/components/showcase/AudioItem.jsx`. */
export default function AudioItem({ item }: { item: ShowcaseNode }) {
  const [hover, setHover] = useState(false);
  const [value, setValue] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const mouseEnter = () => {
    setHover(true);
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play();
  };

  const mouseLeave = () => {
    setHover(false);
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.pause();
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const currentTime = audioRef.current.currentTime;
    const duration = audioRef.current.duration || 1;
    const progress = Math.min((currentTime / Math.floor(duration)) * 100, 100);
    setValue(progress);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "auto",
        aspectRatio: "16/9",
        background: "var(--background-gradient)",
        position: "relative",
        "& .MuiCircularProgress-root": {
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%) rotate(-90deg)!important",
          zIndex: 1,
        },
      }}
      onMouseEnter={mouseEnter}
      onMouseLeave={mouseLeave}
    >
      <MusicNote sx={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 1, fontSize: "4rem" }} />
      <CircularProgress value={value} variant="determinate" size={100} thickness={2} />
      {item.media && <audio ref={audioRef} src={item.media} muted={!hover} loop onTimeUpdate={handleTimeUpdate} />}
    </Paper>
  );
}
