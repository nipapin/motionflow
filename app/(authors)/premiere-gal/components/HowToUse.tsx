import styled from "@emotion/styled";
import { Box, Stack, Typography } from "@mui/material";

const Iframe = styled("iframe")({
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  border: "none",
  borderRadius: "10px",
  overflow: "hidden",
});

/** Port of `resources/js/premieregal/components/HowToUse.jsx`. */
export default function HowToUse() {
  return (
    <Stack direction="column" gap={2} py={8} id="use">
      <Typography textAlign="center" fontWeight={700} fontSize="clamp(24px, 2vw, 40px)" color="var(--text-color)">
        How to Use
      </Typography>
      <Box display="grid" gridTemplateColumns={{ xs: "repeat(1, 1fr)", xl: "repeat(2, 1fr)" }} gap={2}>
        <Stack direction="column" gap={2}>
          <Typography textAlign="center" fontWeight={700} fontSize="clamp(14px, 2vw, 24px)" color="var(--text-color)">
            Windows
          </Typography>
          <Box sx={{ position: "relative", width: "100%", height: "auto", aspectRatio: "16/9" }}>
            <Iframe
              width={560}
              height={315}
              src="https://www.youtube.com/embed/JzQ0lfLhusE?si=kOPSATIVQje3j7un"
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </Box>
        </Stack>
        <Stack direction="column" gap={2}>
          <Typography textAlign="center" fontWeight={700} fontSize="clamp(14px, 2vw, 24px)" color="var(--text-color)">
            Apple
          </Typography>
          <Box sx={{ position: "relative", width: "100%", height: "auto", aspectRatio: "16/9" }}>
            <Iframe
              width={200}
              height={113}
              src="https://www.youtube.com/embed/cr_8QLPgbhA?si=gtqMlT8W6XmpQ6Ea"
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}
