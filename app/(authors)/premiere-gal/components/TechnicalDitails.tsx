"use client";

import { Box, Divider, Stack, Typography } from "@mui/material";
import { Folder, Loop } from "@mui/icons-material";
import { useMobile } from "../hooks/use-mobile";
import { usePackageVersion } from "../hooks/use-package-version";
import { AfterEffectsIcon, PremiereProIcon } from "../icons";
import PaperCard from "./PaperCard";

/** Port of `resources/js/premieregal/components/TechnicalDitails.jsx`. */
export default function TechnicalDitails() {
  const isMobile = useMobile();
  const width = isMobile ? "100%" : "25rem";
  const version = usePackageVersion();
  return (
    <PaperCard sx={{ width, flexDirection: "column", gap: 1, alignItems: "flex-start" }}>
      <Typography fontWeight={700} fontSize={{ xs: 16, md: 20 }} color="var(--text-color)" pb={1}>
        Technical Details
      </Typography>
      <Stack direction="column" gap={1} width="100%">
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <PremiereProIcon fontSize="small" />
          <Typography fontWeight={500} fontSize={13}>
            Adobe Premiere
          </Typography>
          <Typography fontWeight={700} fontSize={13} ml="auto">
            CC 2023+
          </Typography>
        </Box>
        <Divider flexItem />
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <AfterEffectsIcon />
          <Typography fontWeight={500} fontSize={13}>
            Adobe After Effects
          </Typography>
          <Typography fontWeight={700} fontSize={13} ml="auto">
            CC 2023+
          </Typography>
        </Box>
        <Divider flexItem />
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Folder />
          <Typography fontWeight={500} fontSize={13}>
            File Size
          </Typography>
          <Typography fontWeight={700} fontSize={13} ml="auto">
            3.5 GB
          </Typography>
        </Box>
        <Divider flexItem />
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Loop />
          <Typography fontWeight={500} fontSize={13}>
            Current Version
          </Typography>
          <Typography fontWeight={700} fontSize={13} ml="auto">
            {version}
          </Typography>
        </Box>
      </Stack>
    </PaperCard>
  );
}
