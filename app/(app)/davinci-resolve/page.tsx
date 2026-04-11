import { Metadata } from "next";
import { CategoryPageLayout } from "@/components/category-page-layout";
import { getMarketItemsForSoftwareLabel } from "@/lib/market-items";

export const metadata: Metadata = {
  title: "DaVinci Resolve Templates | Motion Flow",
  description: "Download premium DaVinci Resolve templates including color grading LUTs, transitions, Fusion effects, and title sequences. Professional templates for colorists and editors.",
  keywords: ["DaVinci Resolve", "templates", "LUTs", "color grading", "Fusion", "video editing"],
  openGraph: {
    title: "DaVinci Resolve Templates | Motion Flow",
    description: "Download premium DaVinci Resolve templates including color grading LUTs, transitions, and Fusion effects.",
    type: "website",
  },
};

export default async function DaVinciResolvePage() {
  const products = await getMarketItemsForSoftwareLabel("DaVinci Resolve");
  
  return (
    <CategoryPageLayout
      categoryName="DaVinci Resolve"
      products={products}
      title="DaVinci Resolve Templates"
      description="Professional color grading LUTs, Fusion effects, transitions, and title templates for DaVinci Resolve."
    />
  );
}
