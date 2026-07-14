"use client";

import { Check } from "@mui/icons-material";
import { Box, Button, Stack, Typography, useColorScheme } from "@mui/material";
import { useState } from "react";
import { options, pricingPlans, type PricingPlanEntry } from "../entities/pricing";
import { useDiscount } from "../hooks/use-discount";
import { useMobile } from "../hooks/use-mobile";
import { usePageSets } from "../page-sets-context";
import { useBuyGalToolkit } from "../use-buy-gal-toolkit";
import PaperCard from "./PaperCard";
import PricingPlanChip from "./PricingPlanChip";

const YEARLY_BILLED_TOTAL = 199;

/** Port of `resources/js/premieregal/components/PricingPlans.jsx`. */
export function PricingPlans() {
  const isDiscount = useDiscount();
  const pageSets = usePageSets();
  const discountPercent = typeof pageSets.discount_percent === "number" ? pageSets.discount_percent : 50;
  const { mode } = useColorScheme();
  const [activePlan, setActivePlan] = useState(pricingPlans[1]);
  const isMobile = useMobile();
  const width = isMobile ? "100%" : "25rem";
  const buyGalToolkit = useBuyGalToolkit();

  const hasDiscount = isDiscount && (activePlan.priceKey === "yearly" || activePlan.priceKey === "lifetime");
  const discountedPrice = hasDiscount ? +(activePlan.price * (1 - discountPercent / 100)).toFixed(2) : null;

  return (
    <PaperCard sx={{ width, flexDirection: "column", gap: 1 }}>
      <Stack gap={1} direction="column" width="100%" alignItems="center">
        <PaperCard
          sx={{
            width: "100%",
            gap: 1,
            background: mode === "light" ? "#E5E6F3" : "var(--dark-background-color)",
            p: "4px",
            borderRadius: "8px",
          }}
        >
          {pricingPlans.map((plan) => (
            <PricingPlan key={plan.id} hasDiscount={isDiscount} plan={plan} active={activePlan.id === plan.id} onClick={() => setActivePlan(plan)} />
          ))}
        </PaperCard>
        <Stack direction="row" alignItems="baseline" gap={1} sx={{ mt: "1rem" }}>
          {hasDiscount && (
            <Typography fontWeight={700} fontSize={25} color="var(--link-color)" sx={{ textDecoration: "line-through", opacity: 0.5, fontWeight: 400 }}>
              ${activePlan.price}
            </Typography>
          )}
          <Typography fontWeight={700} fontSize={48} color="var(--text-color)" sx={{ display: "flex", alignItems: "baseline" }}>
            ${hasDiscount ? discountedPrice : activePlan.price}{" "}
            <Typography component="span" fontWeight={400} fontSize={20} color="var(--link-color)" sx={{ display: "block" }}>
              {activePlan.per}
            </Typography>
          </Typography>
        </Stack>
        <Typography fontWeight={400} fontSize={12} color="var(--text-color)">
          {activePlan.id === 2 && isDiscount
            ? `Billed yearly ($${(YEARLY_BILLED_TOTAL * (1 - discountPercent / 100)).toFixed(2)})`
            : activePlan.tagline}
        </Typography>
        <Stack direction="column" gap={1} width="100%" mt={2}>
          {options.map((option) => (
            <Stack key={option} direction="row" gap={1} alignItems="center">
              <Check fontSize="small" sx={{ background: "var(--linear-gradient)", color: "white", borderRadius: "50%", p: "2px" }} />
              <Typography fontWeight={400} fontSize={12} color="var(--text-color)">
                {option}
              </Typography>
            </Stack>
          ))}
        </Stack>
        <Button
          fullWidth
          variant="contained"
          sx={{ background: "var(--linear-gradient)", py: "8px", borderRadius: "8px", fontWeight: 400, mt: 2 }}
          onClick={() => buyGalToolkit(activePlan.priceKey)}
        >
          <Typography fontWeight={400} fontSize={12} color="white">
            Get Started Now
          </Typography>
        </Button>
      </Stack>
    </PaperCard>
  );
}

const PricingPlan = ({
  plan,
  active,
  onClick,
  hasDiscount,
}: {
  plan: PricingPlanEntry;
  active: boolean;
  onClick: () => void;
  hasDiscount: boolean;
}) => {
  return (
    <Box sx={{ position: "relative", width: "100%" }}>
      {!hasDiscount && <PricingPlanChip plan={plan} />}
      <Button
        disableElevation
        variant={active ? "contained" : "text"}
        fullWidth
        sx={{ background: active ? "var(--linear-gradient)" : "transparent", py: "8px", borderRadius: "8px", fontWeight: 400 }}
        onClick={onClick}
      >
        <Typography fontWeight={active ? 700 : 400} fontSize={12} color={active ? "white" : undefined}>
          {plan.name}
        </Typography>
      </Button>
    </Box>
  );
};
