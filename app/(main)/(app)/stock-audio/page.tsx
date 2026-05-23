import { Metadata } from "next";
import { CategoryPageLayout } from "@/components/category-page-layout";
import { getMarketItemsPage, getSubCategorySlugs } from "@/lib/market-items";

const INDEX_SLUG = "stock-audio";
const PAGE_SIZE = 20;

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
  const [page, subCategorySlugs] = await Promise.all([
    getMarketItemsPage(INDEX_SLUG, { limit: PAGE_SIZE }),
    getSubCategorySlugs(INDEX_SLUG),
  ]);

  return (
    <CategoryPageLayout
      categoryName="Stock Music"
      products={page.items}
      subCategorySlugs={subCategorySlugs}
      title="Royalty-Free Stock Music"
      description="High-quality background music for your videos, podcasts, and projects. Cinematic, corporate, electronic, and more."
      pagination={{ indexCategorySlug: INDEX_SLUG, pageSize: PAGE_SIZE }}
      initialHasMore={page.hasMore}
    />
  );
}
