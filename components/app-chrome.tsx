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
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { sidebarLabelForPath } from "@/lib/app-chrome-paths";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";

type AppChromeContextValue = {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
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

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const normalizedPath = (pathname.replace(/\/$/, "") || "/") as string;
  const isSpaHome = normalizedPath === "/";

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [spaActiveCategory, setSpaActiveCategory] = useState("All");

  useEffect(() => {
    setSearchQuery("");
  }, [normalizedPath]);

  const routeSidebarLabel = sidebarLabelForPath(normalizedPath);
  const activeCategory = isSpaHome ? spaActiveCategory : routeSidebarLabel;

  const setSearchQueryStable = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

  const setSpaActiveCategoryStable = useCallback((c: string) => {
    setSpaActiveCategory(c);
  }, []);

  const contextValue = useMemo<AppChromeContextValue>(
    () => ({
      searchQuery,
      setSearchQuery: setSearchQueryStable,
      spaActiveCategory,
      setSpaActiveCategory: setSpaActiveCategoryStable,
      isSpaHome,
    }),
    [
      isSpaHome,
      searchQuery,
      setSearchQueryStable,
      spaActiveCategory,
      setSpaActiveCategoryStable,
    ]
  );

  return (
    <AppChromeContext.Provider value={contextValue}>
      <div className="min-h-screen bg-background relative overflow-hidden">
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
            searchQuery={searchQuery}
            onSearchChange={setSearchQueryStable}
            sidebarCollapsed={sidebarCollapsed}
          />
          <main className="p-6 pt-22 pb-24">{children}</main>
          <SiteFooter sidebarCollapsed={sidebarCollapsed} />
        </div>
      </div>
    </AppChromeContext.Provider>
  );
}
