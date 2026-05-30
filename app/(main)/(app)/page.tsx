import type { Metadata } from "next";
import HomePage from "@/components/layout/home-page";
import { getHomeSections } from "@/lib/market-items";

export const metadata: Metadata = {
  title: "Motion Flow — After Effects, Premiere Pro & DaVinci Templates",
  description:
    "Download thousands of premium templates for After Effects, Premiere Pro & DaVinci Resolve. Royalty-free music, sound effects, and AI creative tools — one subscription.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Motion Flow — Premium Video Templates & AI Creative Tools",
    description:
      "Thousands of After Effects, Premiere Pro & DaVinci Resolve templates. Royalty-free audio. AI image, video & voice generation.",
    url: "https://motionflow.pro",
    type: "website",
  },
};

export default async function Home() {
  const sections = await getHomeSections();

  return <HomePage sections={sections} />;
}
