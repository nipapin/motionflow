import { Metadata } from "next";
import { CategoryPageLayout } from "@/components/category-page-layout";
import { getMarketItemsForSoftwareLabel } from "@/lib/market-items";

export const metadata: Metadata = {
  title: "Royalty-Free Stock Music | Motion Flow",
  description: "Download royalty-free stock music for videos, podcasts, and content creation. High-quality background music in various genres including cinematic, corporate, and electronic.",
  keywords: ["stock music", "royalty-free", "background music", "video music", "cinematic music", "corporate music"],
  openGraph: {
    title: "Royalty-Free Stock Music | Motion Flow",
    description: "Download royalty-free stock music for videos, podcasts, and content creation.",
    type: "website",
  },
};

export default async function StockMusicPage() {
  const products = await getMarketItemsForSoftwareLabel("Stock Music");
  
  return (
    <CategoryPageLayout
      categoryName="Stock Music"
      products={products}
      title="Royalty-Free Stock Music"
      description="High-quality background music for your videos, podcasts, and projects. Cinematic, corporate, electronic, and more."
    />
  );
}
