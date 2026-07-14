"use client";

import { Typography, useColorScheme } from "@mui/material";
import { blocks } from "../entities/blocks";
import PaperCard from "./PaperCard";
import { Box } from "@mui/material";

/** Port of `resources/js/premieregal/components/Blocks.jsx`. */
export default function Blocks() {
  const { mode } = useColorScheme();
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xl: "repeat(3, 1fr)", xs: "repeat(2, 1fr)" },
        gap: 1,
      }}
    >
      {blocks.map((block, index) => {
        if (block.video) {
          return (
            <PaperCard
              key={block.id}
              sx={{
                ...block.sx,
                padding: 0,
                overflow: "hidden",
                position: "relative",
                "& video": { width: "100%", position: "absolute", top: 0, left: 0 },
                animationDelay: `${index * 0.03}s`,
              }}
            >
              {block.video.map((video) => (
                <video key={video.src} autoPlay muted playsInline loop style={{ opacity: Number(video.mode === mode) }}>
                  <source src={video.src} type="video/mp4" />
                </video>
              ))}
            </PaperCard>
          );
        }
        return block.image?.map((image) => (
          <PaperCard
            key={block.id}
            sx={{
              ...block.sx,
              backgroundImage: { md: image ? image.src : "", xs: "none" },
              backgroundRepeat: "no-repeat",
              backgroundPosition: image?.sx?.position || "",
              backgroundSize: image?.sx?.size || "",
              animationDelay: `${index * 0.03}s`,
            }}
          >
            <Typography fontWeight={700} fontSize={20} color="var(--text-color)">
              {block.title.text}
            </Typography>
            {block.tagline && (
              <Typography fontWeight={400} fontSize={12} color={mode === "light" ? "var(--link-color)" : "#ffffff80"}>
                {block.tagline}
              </Typography>
            )}
          </PaperCard>
        ));
      })}
    </Box>
  );
}
