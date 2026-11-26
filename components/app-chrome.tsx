"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { sidebarLabelForPath } from "@/lib/app-chrome-paths";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { MobileAudioDrawer } from "@/components/mobile-audio-drawer";
import { useMarketplaceSalePhase } from "@/components/use-marketplace-sale-phase";
import {
  DEFAULT_SEARCH_CATEGORY,
  isSidebarSearchCategory,
  type SearchCategory,
} from "@/lib/search-categories";

const AI_TOOL_SIDEBAR_LABELS = new Set([
  "Image Gen",
  "Image Edit",
  "Video Gen",
  "Text to Speech",
  "Speech to Text",
]);

type AppChromeContextValue = {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchCategory: SearchCategory;
  setSearchCategory: (category: SearchCategory) => void;
  /** Home (`/`) SPA category; other routes ignore reads from pages. */
  spaActiveCategory: string;
  setSpaActiveCategory: (category: string) => void;
  isSpaHome: boolean;
};

const AppChromeContext = createContext<AppChromeContextValue | null>(null);

export function useAppChrome() {
  const ctx = useContext(AppChromeContext);
  if (!ctx) {
    throw new Error("useAppChrome must be used within AppChrome");
  }
  return ctx;
}

export function AppChrome({ children, saleInitialTime = null }: { children: ReactNode; saleInitialTime?: number | null }) {
  const salePhase = useMarketplaceSalePhase(saleInitialTime);
  const pathname = usePathname();
  const normalizedPath = (pathname.replace(/\/$/, "") || "/") as string;
  const isSpaHome = normalizedPath === "/";

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState<SearchCategory>(DEFAULT_SEARCH_CATEGORY);
  const [spaActiveCategory, setSpaActiveCategory] = useState("All");

  const routeSidebarLabel = sidebarLabelForPath(normalizedPath);
  const isAiToolPage = AI_TOOL_SIDEBAR_LABELS.has(routeSidebarLabel);
  const showSearch = true;
  const activeCategory = isSpaHome ? spaActiveCategory : routeSidebarLabel;

  useEffect(() => {
    if (isSidebarSearchCategory(routeSidebarLabel)) {
      setSearchCategory(routeSidebarLabel);
      return;
    }
    if (isSpaHome || isAiToolPage) {
      return;
    }
    setSearchQuery("");
    setSearchCategory(DEFAULT_SEARCH_CATEGORY);
  }, [isSpaHome, isAiToolPage, routeSidebarLabel]);

  const setSearchQueryStable = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

  const setSearchCategoryStable = useCallback((category: SearchCategory) => {
    setSearchCategory(category);
  }, []);

  const setSpaActiveCategoryStable = useCallback((c: string) => {
    setSpaActiveCategory(c);
  }, []);

  const contextValue = useMemo<AppChromeContextValue>(
    () => ({
      searchQuery,
      setSearchQuery: setSearchQueryStable,
      searchCategory,
      setSearchCategory: setSearchCategoryStable,
      spaActiveCategory,
      setSpaActiveCategory: setSpaActiveCategoryStable,
      isSpaHome,
    }),
    [
      isSpaHome,
      searchQuery,
      setSearchQueryStable,
      searchCategory,
      setSearchCategoryStable,
      spaActiveCategory,
      setSpaActiveCategoryStable,
    ]
  );

  return (
    <AppChromeContext.Provider value={contextValue}>
      <div className={cn(
        "relative min-h-screen overflow-hidden bg-background",
        salePhase !== "hidden" && "[--marketplace-sale-height:4rem] sm:[--marketplace-sale-height:3rem]",
      )}>
        {salePhase !== "hidden" && (
          <aside
            aria-label="Black Friday Sale"
            className="fixed inset-x-0 top-0 z-[75] flex h-[var(--marketplace-sale-height)] items-center justify-center gap-3 border-b border-white/15 bg-gradient-to-r from-indigo-900 via-blue-800 to-indigo-900 px-3 text-white sm:gap-5 sm:px-6"
          >
            <p className="min-w-0 text-[13px] leading-tight sm:text-sm">
              <strong className="block sm:inline">Black Friday Sale! Up to 40% off</strong>{" "}
              <span className="block text-blue-100 sm:inline">Stock Assets + AI Tools</span>
            </p>
            <Link
              href="/pricing"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-blue-950 transition-colors hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-4"
            >
              Save Now
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </aside>
        )}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
        </div>

        <Sidebar
          activeCategory={activeCategory}
          onCategoryChange={isSpaHome ? setSpaActiveCategory : () => {}}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          useLinks
        />

        <div
          className={cn(
            "relative transition-all duration-300",
            sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-72"
          )}
        >
          <Header
            showSearch={showSearch}
            searchQuery={searchQuery}
            onSearchChange={setSearchQueryStable}
            searchCategory={searchCategory}
            onSearchCategoryChange={setSearchCategoryStable}
            sidebarCollapsed={sidebarCollapsed}
          />
          <main className="p-6 pt-[calc(5.5rem+var(--marketplace-sale-height,0px))] pb-24">{children}</main>
          <MobileAudioDrawer />
          <SiteFooter sidebarCollapsed={sidebarCollapsed} />
        </div>
      </div>
    </AppChromeContext.Provider>
  );
}
