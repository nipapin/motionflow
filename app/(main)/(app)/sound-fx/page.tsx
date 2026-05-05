import { Metadata } from "next";
import { CategoryPageLayout } from "@/components/category-page-layout";
import { getMarketItemsPage, getSubCategorySlugs } from "@/lib/market-items";

const INDEX_SLUG = "sound-fx";
const PAGE_SIZE = 20;

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
  const [page, subCategorySlugs] = await Promise.all([
    getMarketItemsPage(INDEX_SLUG, { limit: PAGE_SIZE }),
    getSubCategorySlugs(INDEX_SLUG),
  ]);

  return (
    <CategoryPageLayout
      categoryName="Sound FX"
      products={page.items}
      subCategorySlugs={subCategorySlugs}
      title="Sound Effects"
      description="Professional sound effects including whooshes, impacts, UI sounds, ambient loops, and foley for your projects."
      pagination={{ indexCategorySlug: INDEX_SLUG, pageSize: PAGE_SIZE }}
      initialHasMore={page.hasMore}
    />
  );
}
