import { Metadata } from "next";
import { CategoryPageLayout } from "@/components/category-page-layout";
import { getMarketItemsForSoftwareLabel } from "@/lib/market-items";

export const metadata: Metadata = {
  title: "Illustrator Templates | Motion Flow",
  description: "Download premium Illustrator templates including social media graphics, thumbnails, overlays, and print designs. Professional vector graphics for creators.",
  keywords: ["Illustrator", "templates", "graphics", "social media", "thumbnails", "vector"],
  openGraph: {
    title: "Illustrator Templates | Motion Flow",
    description: "Download premium Illustrator templates including social media graphics, thumbnails, and print designs.",
    type: "website",
  },
};

export default async function IllustratorPage() {
  const products = await getMarketItemsForSoftwareLabel("Illustrator");
  
  return (
    <CategoryPageLayout
      categoryName="Illustrator"
      products={products}
      title="Illustrator Templates"
      description="Professional graphic templates, social media kits, thumbnails, and print-ready designs for Adobe Illustrator."
    />
  );
}
