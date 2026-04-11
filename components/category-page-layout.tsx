"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useAppChrome } from "@/components/app-chrome";
import { FilterBar } from "@/components/filter-bar";
import { ProductGrid } from "@/components/product-grid";
import { SignInModal } from "@/components/sign-in-modal";
import { SubscriptionModal } from "@/components/subscription-modal";
import type { Product } from "@/lib/product-types";
import { productMatchesSearch, productPopularityScore } from "@/lib/product-ui";

interface CategoryPageLayoutProps {
  categoryName: string;
  products: Product[];
  title: string;
  description: string;
}

export function CategoryPageLayout({ 
  categoryName, 
  products, 
  title, 
  description 
}: CategoryPageLayoutProps) {
  const { user } = useAuth();
  const { searchQuery } = useAppChrome();
  const [sortBy, setSortBy] = useState("popular");
  const [signInOpen, setSignInOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);

  const isLoggedIn = !!user;

  const handleDownload = () => {
    if (!isLoggedIn) {
      setSignInOpen(true);
    } else {
      setSubscriptionOpen(true);
    }
  };

  const filteredProducts = products.filter((product) => {
    if (!searchQuery) return true;
    return productMatchesSearch(product, searchQuery);
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === "popular") return productPopularityScore(b) - productPopularityScore(a);
    if (sortBy === "newest")
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return 0;
  });

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl lg:text-4xl font-semibold text-foreground mb-3 tracking-tight">
          {title}
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl">{description}</p>
      </div>

      <FilterBar
        activeCategory={categoryName}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />
      <ProductGrid
        products={sortedProducts}
        title={searchQuery ? `Results for "${searchQuery}"` : `${products.length} Templates`}
        onDownload={handleDownload}
      />

      <SignInModal
        open={signInOpen}
        onOpenChange={setSignInOpen}
        onAuthSuccess={() => setSignInOpen(false)}
      />
      <SubscriptionModal open={subscriptionOpen} onOpenChange={setSubscriptionOpen} />
    </>
  );
}
