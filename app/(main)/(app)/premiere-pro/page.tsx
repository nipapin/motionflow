import { Metadata } from "next";
import { CategoryPageLayout } from "@/components/category-page-layout";
import { getMarketItemsForSoftwareLabel, getSubCategorySlugs } from "@/lib/market-items";

const INDEX_SLUG = "premiere-pro";

export const metadata: Metadata = {
  title: "Premiere Pro Templates | Motion Flow",
  description: "Download premium Premiere Pro templates including transitions, slideshows, titles, and video presets. Professional MOGRT templates for video editors.",
  keywords: ["Premiere Pro", "templates", "transitions", "MOGRT", "video editing", "PR templates"],
  openGraph: {
    title: "Premiere Pro Templates | Motion Flow",
    description: "Download premium Premiere Pro templates including transitions, slideshows, titles, and video presets.",
    type: "website",
  },
};

export default async function PremiereProPage() {
  const [products, subCategorySlugs] = await Promise.all([
    getMarketItemsForSoftwareLabel("Premiere Pro"),
    getSubCategorySlugs(INDEX_SLUG),
  ]);

  return (
    <CategoryPageLayout
      categoryName="Premiere Pro"
      products={products}
      subCategorySlugs={subCategorySlugs}
      title="Premiere Pro Templates"
      description="Professional video templates, transitions, slideshows, and title packs for Adobe Premiere Pro."
    />
  );
}
