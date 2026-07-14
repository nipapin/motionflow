"use client";

import { Box, Stack, Typography, useColorScheme } from "@mui/material";
import { useMobile } from "../hooks/use-mobile";
import GalToolkitAppBar from "./AppBar";
import Blocks from "./Blocks";
import Contact from "./Contact";
import Discount from "./Discount";
import Downloads from "./Downloads";
import Faqs from "./Faqs";
import Gifs from "./Gifs";
import HeroGrid from "./HeroGrid";
import HeroVideo from "./HeroVideo";
import HowToUse from "./HowToUse";
import Previews from "./Previews";
import { PricingPlans } from "./PricingPlans";
import Recents from "./Recents";
import TechnicalDitails from "./TechnicalDitails";

/** Port of `resources/js/premieregal/components/Content.jsx`. */
export default function Content() {
  const isMobile = useMobile();
  const { mode } = useColorScheme();
  return (
    <Stack direction="column" gap={2} width="100%">
      <GalToolkitAppBar />
      <HeroVideo />
      {isMobile && (
        <>
          <Downloads />
          <Discount />
          <PricingPlans />
          <TechnicalDitails />
        </>
      )}
      <Box sx={{ py: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2rem" }}>
        <Typography fontSize="15px" textAlign="center" color="var(--text-color)" fontWeight={600}>
          Trusted by 3,000+ Video Creators Worldwide
        </Typography>
        <img
          src="/premiere-gal/assets/logos.png"
          alt="Trusted by 3,000+ Video Creators Worldwide"
          width="80%"
          height="auto"
          style={{ margin: "0 auto", filter: mode === "dark" ? "invert(1) saturate(0) brightness(2)" : "none" }}
        />
      </Box>
      <HeroGrid />
      <Gifs />
      <Blocks />
      <Previews />
      <HowToUse />
      <Faqs />
      <Contact />
      <Recents />
    </Stack>
  );
}
