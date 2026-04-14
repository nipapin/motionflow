import { Metadata } from "next";
import { CategoryPageLayout } from "@/components/category-page-layout";
import { getMarketItemsForSoftwareLabel, getSubCategorySlugs } from "@/lib/market-items";

const INDEX_SLUG = "davinci-resolve";

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
  const [products, subCategorySlugs] = await Promise.all([
    getMarketItemsForSoftwareLabel("DaVinci Resolve"),
    getSubCategorySlugs(INDEX_SLUG),
  ]);

  return (
    <CategoryPageLayout
      categoryName="DaVinci Resolve"
      products={products}
      subCategorySlugs={subCategorySlugs}
      title="DaVinci Resolve Templates"
      description="Professional color grading LUTs, Fusion effects, transitions, and title templates for DaVinci Resolve."
    />
  );
}
