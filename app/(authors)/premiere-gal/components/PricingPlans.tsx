"use client";

import { Check } from "@mui/icons-material";
import { Box, Button, Stack, Typography, useColorScheme } from "@mui/material";
import { useState } from "react";
import { BLACK_FRIDAY_DISCOUNTS, getPremiereGalOffer } from "@/lib/premiere-gal-black-friday";
import { options, pricingPlans, type PricingPlanEntry } from "../entities/pricing";
import { useBlackFridayPhase } from "../hooks/use-black-friday";
import { usePageSets } from "../page-sets-context";
import { useBuyGalToolkit } from "../use-buy-gal-toolkit";
import FreeDownloadDialog from "./FreeDownloadDialog";
import PaperCard from "./PaperCard";
import PricingPlanChip from "./PricingPlanChip";

const YEARLY_BILLED_TOTAL = 199;

/** Port of `resources/js/premieregal/components/PricingPlans.jsx`. */
export function PricingPlans() {
  const pageSets = usePageSets();
  const salePhase = useBlackFridayPhase();
  const { mode } = useColorScheme();
  const [activePlan, setActivePlan] = useState(
    () => pricingPlans.find((p) => p.priceKey === "yearly") ?? pricingPlans[1],
  );
  const [freeDownloadOpen, setFreeDownloadOpen] = useState(false);
  const { buyGalToolkit, openingCheckout } = useBuyGalToolkit();

  const isFree = activePlan.priceKey === "free";
  const isYearly = activePlan.priceKey === "yearly";
  const localPreview = process.env.NODE_ENV === "development" && salePhase === "upcoming";
  const getPlanOffer = (plan: PricingPlanEntry["priceKey"]) => {
    if (localPreview && (plan === "yearly" || plan === "lifetime")) return BLACK_FRIDAY_DISCOUNTS[plan];
    return getPremiereGalOffer(plan, salePhase, pageSets);
  };
  const offer = getPlanOffer(activePlan.priceKey);
  const previewOnly = localPreview && offer?.source === "black-friday";
  const discountFactor = 1 - (offer?.percent ?? 0) / 100;
  const yearlyTotal = YEARLY_BILLED_TOTAL * discountFactor;
  const salePrice = isYearly ? yearlyTotal / 12 : activePlan.price * discountFactor;
  const shownPrice = offer?.source === "black-friday" ? salePrice.toFixed(2)
    : offer ? String(+(activePlan.price * discountFactor).toFixed(2)) : String(activePlan.price);
  const tagline = isYearly && offer?.source === "black-friday"
    ? `First year $${yearlyTotal.toFixed(2)} · then $${YEARLY_BILLED_TOTAL}/year`
    : isYearly && offer ? `Billed yearly ($${yearlyTotal.toFixed(2)})` : activePlan.tagline;
  const featureList = activePlan.features ?? options;
  const maxFeatureCount = Math.max(
    options.length,
    ...pricingPlans.map((plan) => (plan.features ?? options).length),
  );

  const handleCta = () => {
    if (previewOnly) return;
    if (activePlan.priceKey === "free") {
      setFreeDownloadOpen(true);
      return;
    }
    void buyGalToolkit(activePlan.priceKey, offer);
  };

  return (
    <>
    <PaperCard id="pricing" sx={{ width: "100%", flexDirection: "column", gap: 1, alignItems: "stretch" }}>
      <Stack gap={1} direction="column" width="100%" alignItems="center" sx={{ flex: 1 }}>
        <PaperCard
          sx={{
            width: "100%",
            gap: 0.5,
            background: mode === "light" ? "#E5E6F3" : "var(--dark-background-color)",
            p: "4px",
            borderRadius: "8px",
          }}
        >
          {pricingPlans.map((plan) => {
            const planOffer = getPlanOffer(plan.priceKey);
            const promotional = (salePhase === "active" || localPreview) && !!planOffer;
            const chip = promotional ? `${planOffer.percent}% off` : planOffer ? null : plan.chip;
            return (
              <PricingPlan
                key={plan.id}
                chip={chip}
                promotional={promotional}
                plan={plan}
                active={activePlan.id === plan.id}
                onClick={() => setActivePlan(plan)}
              />
            );
          })}
        </PaperCard>
        <Stack direction="row" alignItems="baseline" justifyContent="center" gap={0.75} sx={{ mt: "1rem", minHeight: 56, flexWrap: "wrap" }}>
          {offer && (
            <Typography
              component="del"
              fontWeight={400}
              fontSize={{ xs: 18, xl: 23 }}
              color="var(--link-color)"
            >
              ${offer.source === "black-friday" ? activePlan.price.toFixed(2) : activePlan.price}
            </Typography>
          )}
          <Typography fontWeight={700} fontSize={offer ? { xs: 37, lg: 42, xl: 48 } : 48} color="var(--text-color)"
            sx={{ display: "flex", alignItems: "baseline", gap: 0.5, lineHeight: 1, letterSpacing: offer ? "-0.045em" : undefined }}>
            {isFree ? (
              "Free"
            ) : (
              <>
                ${shownPrice}
                {activePlan.per && (
                  <Typography component="span" fontWeight={400} fontSize={offer ? 15 : 20} color="var(--link-color)" sx={{ letterSpacing: 0 }}>
                    {activePlan.per}
                  </Typography>
                )}
              </>
            )}
          </Typography>
        </Stack>
        <Typography fontWeight={400} fontSize={12} color="var(--text-color)" sx={{ minHeight: 18, textAlign: "center" }}>
          {tagline}
        </Typography>
        <Stack
          direction="column"
          gap={1}
          width="100%"
          mt={2}
          sx={{ minHeight: maxFeatureCount * 28, justifyContent: "flex-start" }}
        >
          {featureList.map((option) => (
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
          sx={{ background: "var(--linear-gradient)", py: "8px", borderRadius: "8px", fontWeight: 400, mt: "auto" }}
          onClick={handleCta}
          disabled={openingCheckout || previewOnly}
          aria-busy={openingCheckout}
        >
          <Typography fontWeight={400} fontSize={12} color="white">
            {isFree ? "Download the Free Version." : "Get Started Now"}
          </Typography>
        </Button>
      </Stack>
    </PaperCard>
    <FreeDownloadDialog open={freeDownloadOpen} onClose={() => setFreeDownloadOpen(false)} />
    </>
  );
}

const PricingPlan = ({
  plan,
  active,
  onClick,
  chip,
  promotional,
}: {
  plan: PricingPlanEntry;
  active: boolean;
  onClick: () => void;
  chip: string | null;
  promotional: boolean;
}) => {
  return (
    <Box sx={{ position: "relative", width: "100%" }}>
      {chip && <PricingPlanChip label={chip} promotional={promotional} />}
      <Button
        disableElevation
        variant={active ? "contained" : "text"}
        fullWidth
        sx={{
          background: active ? "var(--linear-gradient)" : "transparent",
          py: "8px",
          px: 0.5,
          borderRadius: "8px",
          fontWeight: 400,
          minWidth: 0,
          color: active ? "white" : "var(--text-color)",
        }}
        onClick={onClick}
      >
        <Typography fontWeight={active ? 700 : 400} fontSize={11} color="inherit" whiteSpace="nowrap">
          {plan.name}
        </Typography>
      </Button>
    </Box>
  );
};
