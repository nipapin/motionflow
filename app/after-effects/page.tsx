import { Metadata } from "next";
import { CategoryPageLayout } from "@/components/category-page-layout";
import { getMarketItemsForSoftwareLabel } from "@/lib/market-items";

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
  const products = await getMarketItemsForSoftwareLabel("After Effects");
  
  return (
    <CategoryPageLayout
      categoryName="After Effects"
      products={products}
      title="After Effects Templates"
      description="Professional motion graphics templates, logo reveals, title animations, and visual effects for Adobe After Effects."
    />
  );
}
