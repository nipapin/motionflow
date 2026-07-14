"use client";

import { Stack } from "@mui/material";
import { useMobile } from "../hooks/use-mobile";
import Discount from "./Discount";
import Downloads from "./Downloads";
import { PricingPlans } from "./PricingPlans";
import TechnicalDitails from "./TechnicalDitails";

/** Port of `resources/js/premieregal/components/Sidebar.jsx`. */
export default function Sidebar() {
  const isMobile = useMobile();
  return (
    <Stack direction="column" gap={2} sx={{ position: "sticky", top: "0.5rem", display: isMobile ? "none" : "flex" }}>
      <Downloads />
      <Discount />
      <PricingPlans />
      <TechnicalDitails />
    </Stack>
  );
}
