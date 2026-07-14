import { Box, Typography } from "@mui/material";
import AudioItem from "./AudioItem";
import type { ShowcaseNode } from "../showcase-types";

/** Port of `resources/js/premieregalassets/components/showcase/PreviewCard.jsx`. */
export default function PreviewCard({ item }: { item: ShowcaseNode }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem", py: "1rem", borderRadius: "0.5rem", backgroundColor: "var(--background-gradient)" }}>
      {item.type === "video" && item.media && (
        <video
          src={item.media}
          autoPlay
          muted
          loop
          style={{ width: "100%", height: "auto", objectFit: "cover", borderRadius: "1rem 1rem 0 0" }}
        />
      )}
      {item.type === "audio" && item.media && <AudioItem item={item} />}
      {item.description && (
        <Typography variant="body2" sx={{ color: "text.secondary", textWrap: "balance" }}>
          {item.description}
        </Typography>
      )}
    </Box>
  );
}
