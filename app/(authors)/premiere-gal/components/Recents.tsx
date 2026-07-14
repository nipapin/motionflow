import { Box, Card, CardActionArea, CardHeader, CardMedia, Stack, Typography } from "@mui/material";

const projects = [
  {
    id: 1,
    image: "https://img.youtube.com/vi/bQXIs5_aI_Y/maxresdefault.jpg",
    href: "https://www.youtube.com/watch?v=bQXIs5_aI_Y",
    name: "How To Make Vlog or Movie Titles Look Awesome In Seconds",
  },
  {
    id: 2,
    image: "https://img.youtube.com/vi/Qiyi-xb1-SE/maxresdefault.jpg",
    href: "https://www.youtube.com/watch?v=Qiyi-xb1-SE",
    name: "How To Make Awesome Y2K Retro Titles Fast!",
  },
];

/** Port of `resources/js/premieregal/components/Recents.jsx`. */
export default function Recents() {
  return (
    <Stack direction="column" gap={2} pb="2rem" py={8}>
      <Typography fontWeight={700} fontSize="clamp(28px, 2vw, 40px)" color="var(--text-color)">
        Check our tutorials
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xl: "repeat(3, 1fr)", xs: "repeat(1, 1fr)" }, gap: 2 }}>
        {projects.map((project) => (
          <CardActionArea key={project.id} href={project.href} sx={{ textDecoration: "none!important", borderRadius: "1rem" }}>
            <Card variant="outlined" sx={{ borderRadius: "1rem" }}>
              <CardMedia image={project.image} sx={{ height: "200px" }} />
              <CardHeader title={project.name} slotProps={{ title: { sx: { fontSize: "1rem" } } }} />
            </Card>
          </CardActionArea>
        ))}
      </Box>
    </Stack>
  );
}
