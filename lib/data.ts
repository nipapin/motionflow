export type ProjectApp = "Premiere Pro" | "After Effects";

export type Project = {
  id: string;
  title: string;
  app: ProjectApp;
  price: number;
  /** Cover image path in /public (16:9 recommended) */
  coverImage: string;
  href?: string;
};

export const projects: Project[] = [
  {
    id: "cinematic-pack",
    title: "Cinematic Color Pack",
    app: "Premiere Pro",
    price: 19,
    coverImage: "/project-cover.png",
  },
  {
    id: "motion-titles",
    title: "Motion Titles 120+",
    app: "After Effects",
    price: 29,
    coverImage: "/project-cover.png",
  },
  {
    id: "transitions-pro",
    title: "Transitions Pro",
    app: "Premiere Pro",
    price: 24,
    coverImage: "/project-cover.png",
  },
  {
    id: "social-media-kit",
    title: "Social Media Kit",
    app: "Premiere Pro",
    price: 34,
    coverImage: "/project-cover.png",
  },
  {
    id: "vfx-library",
    title: "VFX Library Vol.1",
    app: "After Effects",
    price: 39,
    coverImage: "/project-cover.png",
  },
  {
    id: "vlog-essentials",
    title: "Vlog Essentials",
    app: "Premiere Pro",
    price: 15,
    coverImage: "/project-cover.png",
  },
];

export type Plan = {
  id: string;
  name: string;
  period: "month" | "year";
  price: number;
  priceSuffix: string;
  description: string;
  highlight?: boolean;
  savings?: string;
  features: string[];
  cta: string;
};

export type SpunkramSubscriptionTierId = "library" | "ai_toolkit";

export type SpunkramSubscriptionTier = {
  id: SpunkramSubscriptionTierId;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  savings?: string;
  highlight?: boolean;
  features: string[];
};

export const spunkramSubscriptionTiers: SpunkramSubscriptionTier[] = [
  {
    id: "library",
    name: "Spunkram Library",
    monthlyPrice: 14.9,
    yearlyPrice: 119,
    savings: "−33%",
    features: [
      "Access to all existing packs",
      "Every new pack included for free",
      "Commercial license",
      "Updates included",
      "Cancel in 1 click",
    ],
  },
  {
    id: "ai_toolkit",
    name: "AI Toolkit",
    monthlyPrice: 19.9,
    yearlyPrice: 202.8,
    savings: "−15%",
    highlight: true,
    features: [
      "Everything in Spunkram Library",
      "Full access to AI Tools",
      "Image, video & audio generation",
      "Commercial license",
      "Cancel in 1 click",
    ],
  },
];

/** Legacy billing-period rows used by the projects subscription banner. */
export const plans: Plan[] = [
  {
    id: "monthly",
    name: "Spunkram Library",
    period: "month",
    price: 14.9,
    priceSuffix: "/mo",
    description: "Unlock every pack — cancel anytime.",
    features: spunkramSubscriptionTiers[0].features,
    cta: "Unlock all packs",
  },
  {
    id: "yearly",
    name: "Spunkram Library",
    period: "year",
    price: 119,
    priceSuffix: "/yr",
    description: "Best deal — save 33% compared to monthly.",
    highlight: true,
    savings: "−33%",
    features: spunkramSubscriptionTiers[0].features,
    cta: "Unlock all packs",
  },
];

export const faq = [
  {
    q: "Is the extension really free?",
    a: "Yes. The Spunkram extension is free to download and install on Windows and macOS. Only the projects and subscription are paid.",
  },
  {
    q: "Which versions of Premiere Pro and After Effects are supported?",
    a: "Adobe Premiere Pro and After Effects 2021 and newer are supported. Works on Windows 10/11 and macOS 11+ (Intel and Apple Silicon).",
  },
  {
    q: "Can I buy just a single project?",
    a: "Absolutely. Any project can be purchased individually and used forever, with no time limits, under a commercial license.",
  },
  {
    q: "How is the subscription different from a one-time purchase?",
    a: "The subscription gives you access to the entire library and all new packs as they are released. A one-time purchase gives you one specific project forever.",
  },
  {
    q: "Can I cancel the subscription?",
    a: "Yes, you can cancel in 1 click from your account. You keep access until the end of the paid period.",
  },
  {
    q: "Is there a commercial license?",
    a: "Yes. All projects can be used in commercial videos, ads and client work without any additional royalties.",
  },
];
