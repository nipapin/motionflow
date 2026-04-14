import { Metadata } from "next";
import { CategoryPageLayout } from "@/components/category-page-layout";
import { getMarketItemsForSoftwareLabel, getSubCategorySlugs } from "@/lib/market-items";

const INDEX_SLUG = "after-effects";

export const metadata: Metadata = {
  title: "After Effects Templates | Motion Flow",
  description: "Download premium After Effects templates including logo reveals, titles, transitions, and motion graphics. Professional quality templates for video editors.",
  keywords: ["After Effects", "templates", "motion graphics", "logo reveals", "video editing", "AE templates"],
  openGraph: {
    title: "After Effects Templates | Motion Flow",
    description: "Download premium After Effects templates including logo reveals, titles, transitions, and motion graphics.",
    type: "website",
  },
};

export default async function AfterEffectsPage() {
  const [products, subCategorySlugs] = await Promise.all([
    getMarketItemsForSoftwareLabel("After Effects"),
    getSubCategorySlugs(INDEX_SLUG),
  ]);

  return (
    <CategoryPageLayout
      categoryName="After Effects"
      products={products}
      subCategorySlugs={subCategorySlugs}
      title="After Effects Templates"
      description="Professional motion graphics templates, logo reveals, title animations, and visual effects for Adobe After Effects."
    />
  );
}
