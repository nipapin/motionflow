"use client";

import { useState } from "react";
import { useAppChrome } from "@/components/app-chrome";
import { HeroBanner } from "@/components/hero-banner";
import { FilterBar } from "@/components/filter-bar";
import { ProductGrid } from "@/components/product-grid";
import { SignInModal } from "@/components/sign-in-modal";
import { SubscriptionModal } from "@/components/subscription-modal";
import { ImageGenerator } from "@/components/image-generator";
import { VideoGenerator } from "@/components/video-generator";
import type { Product } from "@/lib/product-types";
import {
  productMatchesSearch,
  productMatchesSidebarCategory,
  productPopularityScore,
  productSoftwareLabel,
} from "@/lib/product-ui";
import { useAuth } from "@/components/auth-provider";

const isHomeView = (category: string) => category === "All";

interface HomePageProps {
  marketItems: Product[];
}

export default function Home({ marketItems }: HomePageProps) {
  const { user } = useAuth();
  const { searchQuery, spaActiveCategory, setSpaActiveCategory } = useAppChrome();
  const catalogProducts = marketItems;
  const activeCategory = spaActiveCategory;
  const setActiveCategory = setSpaActiveCategory;
  const [sortBy, setSortBy] = useState("popular");
  const [signInOpen, setSignInOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [mostPopularSoftware, setMostPopularSoftware] = useState("After Effects");

  const isLoggedIn = !!user;

  const handleDownload = () => {
    if (!isLoggedIn) {
      setSignInOpen(true);
    } else {
      setSubscriptionOpen(true);
    }
  };

  const filteredProducts = catalogProducts.filter((product) => {
    const matchesSearch = !searchQuery.trim() || productMatchesSearch(product, searchQuery);

    if (activeCategory === "All" || activeCategory === "New Releases") return matchesSearch;

    return matchesSearch && productMatchesSidebarCategory(product, activeCategory);
  });

  const mostPopular = catalogProducts
    .filter((p) => productSoftwareLabel(p) === mostPopularSoftware)
    .sort((a, b) => productPopularityScore(b) - productPopularityScore(a))
    .slice(0, 6);

  return (
    <>
      {activeCategory === "Image Gen" ? (
        <ImageGenerator />
      ) : activeCategory === "Video Gen" ? (
        <VideoGenerator />
      ) : isHomeView(activeCategory) && !searchQuery ? (
        <>
          <HeroBanner onCategoryChange={setActiveCategory} />
          <ProductGrid
            products={mostPopular}
            title="Most Popular"
            onDownload={handleDownload}
            showCategoryFilter={true}
            selectedSoftware={mostPopularSoftware}
            onSoftwareChange={setMostPopularSoftware}
          />
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

      <SignInModal
        open={signInOpen}
        onOpenChange={setSignInOpen}
        onAuthSuccess={() => setSignInOpen(false)}
      />
      <SubscriptionModal open={subscriptionOpen} onOpenChange={setSubscriptionOpen} />
    </>
  );
}
