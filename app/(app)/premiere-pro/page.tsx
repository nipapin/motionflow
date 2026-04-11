import { Metadata } from "next";
import { CategoryPageLayout } from "@/components/category-page-layout";
import { getMarketItemsForSoftwareLabel } from "@/lib/market-items";

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
  const products = await getMarketItemsForSoftwareLabel("Premiere Pro");
  
  return (
    <CategoryPageLayout
      categoryName="Premiere Pro"
      products={products}
      title="Premiere Pro Templates"
      description="Professional video templates, transitions, slideshows, and title packs for Adobe Premiere Pro."
    />
  );
}
