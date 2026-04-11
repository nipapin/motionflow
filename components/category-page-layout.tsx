"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("popular");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
      </div>
      
      <Sidebar 
        activeCategory={categoryName} 
        onCategoryChange={() => {}}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        useLinks={true}
      />
      
      <div className={cn("transition-all duration-300", sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-72")}>
        <Header 
          searchQuery={searchQuery} 
          onSearchChange={setSearchQuery}
          sidebarCollapsed={sidebarCollapsed}
        />
        
        <main className="p-6 pt-22">
          {/* Category Header */}
          <div className="mb-8">
            <h1 className="text-3xl lg:text-4xl font-semibold text-foreground mb-3 tracking-tight">
              {title}
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              {description}
            </p>
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
