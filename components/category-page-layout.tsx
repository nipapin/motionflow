"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useAppChrome } from "@/components/app-chrome";
import { FilterBar } from "@/components/filter-bar";
import { ProductGrid } from "@/components/product-grid";
import { SignInModal } from "@/components/sign-in-modal";
import { SubscriptionModal } from "@/components/subscription-modal";
import { DownloadStartedModal } from "@/components/download-started-modal";
import type { Product } from "@/lib/product-types";
import { productMatchesSearch, productPopularityScore } from "@/lib/product-ui";

function titleCaseSlug(slug: string): string {
  return slug
    .trim()
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildSubCategoryMap(slugs: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const slug of slugs) {
    if (!map.has(slug)) map.set(slug, titleCaseSlug(slug));
  }
  return map;
}

function productMatchesSubCategory(product: Product, subSlug: string): boolean {
  const raw = product.sub_category_slug?.trim() ?? "";
  return raw.split(",").some((s) => s.trim() === subSlug);
}

interface PaginationConfig {
  indexCategorySlug: string;
  pageSize?: number;
}

interface CategoryPageLayoutProps {
  categoryName: string;
  products: Product[];
  subCategorySlugs?: string[];
  title: string;
  description: string;
  pagination?: PaginationConfig;
  initialHasMore?: boolean;
}

export function CategoryPageLayout({
  categoryName,
  products: initialProducts,
  subCategorySlugs = [],
  title,
  description,
  pagination,
  initialHasMore = false,
}: CategoryPageLayoutProps) {
  const { user } = useAuth();
  const { searchQuery } = useAppChrome();
  const [sortBy, setSortBy] = useState("popular");
  const [selectedSubCategory, setSelectedSubCategory] = useState("");
  const [signInOpen, setSignInOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [downloadStartedOpen, setDownloadStartedOpen] = useState(false);
  const [downloadItemId, setDownloadItemId] = useState<number | null>(null);

  const [allProducts, setAllProducts] = useState(initialProducts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAllProducts(initialProducts);
    setHasMore(initialHasMore);
  }, [initialProducts, initialHasMore]);

  const subCategoryMap = useMemo(() => buildSubCategoryMap(subCategorySlugs), [subCategorySlugs]);
  const subCategoryLabels = useMemo(() => Array.from(subCategoryMap.values()), [subCategoryMap]);

  const isLoggedIn = !!user;

  const handleDownload = async (product: Product) => {
    if (!isLoggedIn) {
      setSignInOpen(true);
      return;
    }
    try {
      const res = await fetch(`/api/me/can-download?itemId=${product.id}`);
      const data = (await res.json()) as { canDownload?: boolean };
      if (data.canDownload) {
        setDownloadItemId(product.id);
        setDownloadStartedOpen(true);
        return;
      }
    } catch {
      setDownloadItemId(product.id);
      setDownloadStartedOpen(true);
      return;
    }
    setSubscriptionOpen(true);
  };

  const selectedSlug = useMemo(() => {
    if (!selectedSubCategory) return "";
    for (const [slug, label] of subCategoryMap) {
      if (label === selectedSubCategory) return slug;
    }
    return "";
  }, [selectedSubCategory, subCategoryMap]);

  const filteredProducts = allProducts.filter((product) => {
    if (selectedSlug && !productMatchesSubCategory(product, selectedSlug)) return false;
    if (searchQuery && !productMatchesSearch(product, searchQuery)) return false;
    return true;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === "popular") return productPopularityScore(b) - productPopularityScore(a);
    if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return 0;
  });

  const loadMore = useCallback(async () => {
    if (!pagination || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const lastId = allProducts.length > 0 ? allProducts[allProducts.length - 1].id : undefined;
      const params = new URLSearchParams({ slug: pagination.indexCategorySlug });
      if (lastId != null) params.set("beforeId", String(lastId));
      if (pagination.pageSize) params.set("limit", String(pagination.pageSize));

      const res = await fetch(`/api/market-items?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const newItems: Product[] = data.items ?? [];
      setAllProducts((prev) => [...prev, ...newItems]);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      console.error("[loadMore]", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [pagination, isLoadingMore, hasMore, allProducts]);

  useEffect(() => {
    if (!pagination || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [pagination, hasMore, loadMore]);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl lg:text-4xl font-semibold text-foreground mb-3 tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-lg max-w-2xl">{description}</p>
      </div>

      <FilterBar
        activeCategory={categoryName}
        subCategories={subCategoryLabels}
        selectedSubCategory={selectedSubCategory}
        onSubCategoryChange={setSelectedSubCategory}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />
      <ProductGrid
        products={sortedProducts}
        title={searchQuery ? `Results for "${searchQuery}"` : undefined}
        onDownload={handleDownload}
        sentinelRef={pagination ? sentinelRef : undefined}
        isLoadingMore={isLoadingMore}
      />

      <SignInModal open={signInOpen} onOpenChange={setSignInOpen} onAuthSuccess={() => setSignInOpen(false)} />
      <SubscriptionModal open={subscriptionOpen} onOpenChange={setSubscriptionOpen} />
      <DownloadStartedModal open={downloadStartedOpen} itemId={downloadItemId} />
    </>
  );
}
