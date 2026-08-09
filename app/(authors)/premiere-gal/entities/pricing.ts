import type { PremiereGalPlanId } from "@/lib/premiere-gal-paddle-config";

export type PricingPlanKey = PremiereGalPlanId | "free";

export interface PricingPlanEntry {
  id: number;
  name: string;
  price: number;
  per: string;
  tagline: string;
  chip: string | null;
  priceKey: PricingPlanKey;
  features?: string[];
}

const PAID_FEATURES = [
  "Adobe Premiere version",
  "Adobe After Effects version",
  "2500+ Editing Assets",
  "Handy Scripts",
  "Photo & Video Stock Assets",
  "Personal & Commercial Use",
  "Regular Updates",
];

/** Port of `resources/js/premieregal/entities/pricing.jsx`. */
export const pricingPlans: PricingPlanEntry[] = [
  {
    id: 0,
    name: "Try Free",
    price: 0,
    per: "",
    tagline: "No credit card required",
    chip: null,
    priceKey: "free",
    features: [
      "Adobe Premiere version",
      "Adobe After Effects version",
      "110 Free Items",
      "Photo & Video Stock Assets",
      "Personal Use",
    ],
  },
  {
    id: 1,
    name: "Monthly",
    price: 19.99,
    per: "/mo",
    tagline: "Billed monthly",
    chip: null,
    priceKey: "monthly",
  },
  {
    id: 2,
    name: "Yearly",
    price: 16.5,
    per: "/mo",
    tagline: "Billed yearly ($199)",
    chip: "Save 17%",
    priceKey: "yearly",
  },
  {
    id: 3,
    name: "Lifetime",
    price: 499,
    per: "/lifetime",
    tagline: "Billed once, yours forever",
    chip: "Best Value",
    priceKey: "lifetime",
  },
];

export const options: string[] = PAID_FEATURES;
