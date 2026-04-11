"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
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
  const catalogProducts = marketItems;
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("popular");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
      </div>

      <Sidebar
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      <div className={cn("transition-all duration-300", sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-72")}>
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} sidebarCollapsed={sidebarCollapsed} />

        <main className="p-6 pt-22">
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
              <FilterBar activeCategory={activeCategory} sortBy={sortBy} onSortChange={setSortBy} />
              <ProductGrid
                products={filteredProducts}
                title={searchQuery ? `Results for "${searchQuery}"` : activeCategory}
                onDownload={handleDownload}
              />
            </>
          )}
        </main>
      </div>

      <SignInModal
        open={signInOpen}
        onOpenChange={setSignInOpen}
        onAuthSuccess={() => setSignInOpen(false)}
      />
      <SubscriptionModal open={subscriptionOpen} onOpenChange={setSubscriptionOpen} />
    </div>
  );
}
