import { Metadata } from "next";
import { CategoryPageLayout } from "@/components/category-page-layout";
import { getMarketItemsForSoftwareLabel } from "@/lib/market-items";

export const metadata: Metadata = {
  title: "Sound Effects | Motion Flow",
  description: "Download professional sound effects for video editing, game development, and content creation. Whooshes, impacts, UI sounds, ambient, and more.",
  keywords: ["sound effects", "SFX", "audio effects", "whoosh", "impact sounds", "UI sounds", "ambient"],
  openGraph: {
    title: "Sound Effects | Motion Flow",
    description: "Download professional sound effects for video editing, game development, and content creation.",
    type: "website",
  },
};

export default async function SoundFXPage() {
  const products = await getMarketItemsForSoftwareLabel("Sound FX");
  
  return (
    <CategoryPageLayout
      categoryName="Sound FX"
      products={products}
      title="Sound Effects"
      description="Professional sound effects including whooshes, impacts, UI sounds, ambient loops, and foley for your projects."
    />
  );
}
