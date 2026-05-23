"use client";

import { useState } from "react";
import { useAppChrome } from "@/components/app-chrome";
import { HeroBanner } from "@/components/hero-banner";
import { FilterBar } from "@/components/filter-bar";
import { ProductGrid } from "@/components/product-grid";
import { SignInModal } from "@/components/sign-in-modal";
import { SubscriptionModal } from "@/components/subscription-modal";
import { ImageGenerator } from "@/components/image-generator";
import { ImageEditor } from "@/components/image-editor";
import { VideoGenerator } from "@/components/video-generator";
import type { Product } from "@/lib/product-types";
import { productMatchesSearch, productMatchesSidebarCategory } from "@/lib/product-ui";
import { useAuth } from "@/components/auth-provider";
import type { HomeSection } from "@/lib/market-items";
import { startMarketplaceDownload } from "@/lib/open-marketplace-download";

const isHomeView = (category: string) => category === "All";

interface HomePageProps {
  sections: HomeSection[];
}

export default function Home({ sections }: HomePageProps) {
  const { user } = useAuth();
  const { searchQuery, searchCategory, spaActiveCategory, setSpaActiveCategory } = useAppChrome();
  const activeCategory = spaActiveCategory;
  const setActiveCategory = setSpaActiveCategory;
  const [sortBy, setSortBy] = useState("popular");
  const [signInOpen, setSignInOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const isLoggedIn = !!user;

  const handleDownload = async (product: Product) => {
    if (!isLoggedIn) {
      setSignInOpen(true);
      return;
    }
    try {
      const res = await fetch(`/api/me/can-download?itemId=${product.id}`);
      if (!res.ok) {
        setSubscriptionOpen(true);
        return;
      }
      const data = (await res.json()) as { canDownload?: boolean };
      if (data.canDownload) {
        void startMarketplaceDownload(product.id);
        return;
      }
    } catch (e) {
      console.error("[home handleDownload]", e);
    }
    setSubscriptionOpen(true);
  };

  const allProducts = sections.flatMap((s) => s.items);

  const filteredProducts = allProducts.filter((product) => {
    const matchesSearch = !searchQuery.trim() || productMatchesSearch(product, searchQuery);
    const matchesSearchCategory =
      !searchQuery.trim() || productMatchesSidebarCategory(product, searchCategory);
    if (activeCategory === "All" || activeCategory === "New Releases") {
      return matchesSearch && matchesSearchCategory;
    }
    return matchesSearch && matchesSearchCategory && productMatchesSidebarCategory(product, activeCategory);
  });

  return (
    <>
      {activeCategory === "Image Gen" ? (
        <ImageGenerator />
      ) : activeCategory === "Image Edit" ? (
        <ImageEditor />
      ) : activeCategory === "Video Gen" ? (
        <VideoGenerator />
      ) : isHomeView(activeCategory) ? (
        <>
          <HeroBanner onCategoryChange={setActiveCategory} />
          {sections.map((section) => (
            <ProductGrid key={section.title} products={section.items} title={section.title} onDownload={handleDownload} />
          ))}
        </>
      ) : (
        <>
          <FilterBar
            activeCategory={activeCategory}
            subCategories={[]}
            selectedSubCategory=""
            onSubCategoryChange={() => {}}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
          <ProductGrid
            products={filteredProducts}
            title={searchQuery ? `Results for "${searchQuery}"` : activeCategory}
            onDownload={handleDownload}
          />
        </>
      )}

      <SignInModal open={signInOpen} onOpenChange={setSignInOpen} onAuthSuccess={() => setSignInOpen(false)} />
      <SubscriptionModal open={subscriptionOpen} onOpenChange={setSubscriptionOpen} />
    </>
  );
}
