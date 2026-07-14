import { Box, Skeleton } from "@mui/material";

/** Port of `resources/js/premieregalassets/components/showcase/PreviewSkeleton.jsx`. */
export default function PreviewSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem", p: "1rem" }}>
      <Skeleton variant="text" width={200} height={32} />
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" sx={{ aspectRatio: "16/9", borderRadius: "0.5rem", width: "100%" }} />
        ))}
      </Box>
    </Box>
  );
}
