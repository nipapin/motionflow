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

export const plans: Plan[] = [
  {
    id: "monthly",
    name: "Monthly",
    period: "month",
    price: 19.9,
    priceSuffix: "/mo",
    description: "Unlock every project — cancel anytime.",
    features: [
      `Instant access to all ${projects.length} projects`,
      "Every new pack included for free",
      "Commercial license",
      "Updates included",
      "Cancel in 1 click",
    ],
    cta: "Unlock all projects",
  },
  {
    id: "yearly",
    name: "Yearly",
    period: "year",
    price: 191,
    priceSuffix: "/yr",
    description: "Best deal — save 20% compared to monthly.",
    highlight: true,
    savings: "−20%",
    features: [
      "Everything in Monthly",
      "Priority 24/7 support",
      "Early access to new releases",
      "Exclusive templates",
      "Discounts on partner services",
    ],
    cta: "Unlock all projects",
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
