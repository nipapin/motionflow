import type { PremiereGalPlanId } from "@/lib/premiere-gal-paddle-config";

export interface PricingPlanEntry {
  id: number;
  name: string;
  price: number;
  per: string;
  tagline: string;
  chip: string | null;
  priceKey: PremiereGalPlanId;
}

/** Port of `resources/js/premieregal/entities/pricing.jsx`. */
export const pricingPlans: PricingPlanEntry[] = [
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

export const options: string[] = [
  "Adobe Premiere version",
  "Adobe After Effects version",
  "2500+ Editing Assets",
  "Handy Scripts",
  "Photo & Video Stock Assets",
  "Personal & Commercial Use",
  "Regular Updates",
];
