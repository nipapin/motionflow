"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Moon, Sun, User, ShoppingBag, CreditCard, Download, Bookmark, LogOut, X, Sparkles, ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SignInModal } from "@/components/sign-in-modal";
import { useAuth } from "@/components/auth-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { SEARCH_CATEGORY_OPTIONS, searchCategoryHref, type SearchCategory } from "@/lib/search-categories";

interface HeaderProps {
  showSearch: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchCategory: SearchCategory;
  onSearchCategoryChange: (category: SearchCategory) => void;
  sidebarCollapsed?: boolean;
}

export function Header({
  showSearch,
  searchQuery,
  onSearchChange,
  searchCategory,
  onSearchCategoryChange,
  sidebarCollapsed,
}: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false);
  const [mobileSearchFocused, setMobileSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isLoggedIn = !!user;

  const openSignInModal = () => {
    setAuthModalMode("signin");
    setSignInOpen(true);
  };

  const openSignUpModal = () => {
    setAuthModalMode("signup");
    setSignInOpen(true);
  };
  useEffect(() => {
    setMounted(true);
  }, []);

  const searchCategoryLabel = searchCategory || "Category";
  const searchPlaceholder = desktopSearchFocused
    ? `Try "hip hop", "meditation", "tutorial"...`
    : "Search";

  const handleSearchCategorySelect = (category: SearchCategory) => {
    onSearchCategoryChange(category);
    if (!searchQuery.trim()) return;
    const href = searchCategoryHref(category);
    if (!href || href === pathname) return;
    router.push(href);
  };

  const handleSearchInputChange = (nextQuery: string) => {
    onSearchChange(nextQuery);
    if (!nextQuery.trim()) return;
    const href = searchCategoryHref(searchCategory);
    if (!href || href === pathname) return;
    router.push(href);
  };

  useEffect(() => {
    if (!showSearch && mobileSearchOpen) {
      setMobileSearchOpen(false);
    }
  }, [showSearch, mobileSearchOpen]);

  useEffect(() => {
    if (!mobileSearchOpen) {
      setMobileSearchFocused(false);
    } else {
      setMobileSearchFocused(true);
    }
  }, [mobileSearchOpen]);

  return (
    <header className={`fixed top-0 right-0 left-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50 transition-all duration-300 ${sidebarCollapsed ? 'lg:left-[72px]' : 'lg:left-72'}`}>
      <div
        className={cn(
          "flex items-center h-16 px-4 lg:px-6",
          showSearch ? "justify-between" : "justify-end",
        )}
      >
        {/* Spacer for mobile hamburger */}
        <div className={showSearch ? "w-12 lg:hidden" : "w-0 lg:hidden"} />
        
        {/* Desktop Search */}
        {showSearch && (
          <div className="hidden lg:block flex-1 max-w-3xl">
            <div
              className={cn(
                "flex h-12 items-center rounded-full border px-3 transition-all duration-200",
                desktopSearchFocused
                  ? "border-blue-500/70 bg-linear-to-r from-blue-500/15 to-blue-900/20 shadow-[0_0_0_2px_rgba(59,130,246,0.25)]"
                  : "border-blue-500/35 bg-linear-to-r from-blue-500/8 to-blue-900/12 hover:border-blue-500/55"
              )}
              onFocusCapture={() => setDesktopSearchFocused(true)}
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setDesktopSearchFocused(false);
                }
              }}
            >
              {desktopSearchFocused && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-8 rounded-full border border-blue-500/30 bg-blue-500/15 px-3 text-sm text-foreground hover:bg-blue-500/20"
                      >
                        {searchCategoryLabel}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-popover border-border">
                      {SEARCH_CATEGORY_OPTIONS.map((category) => (
                        <DropdownMenuItem
                          key={category}
                          onClick={() => handleSearchCategorySelect(category)}
                          className={cn(
                            "text-popover-foreground hover:bg-secondary",
                            category === searchCategory && "bg-secondary"
                          )}
                        >
                          {category}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                </>
              )}
              {!desktopSearchFocused && <Search className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <Input
                type="search"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                className="h-10 flex-1 border-0 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>
        )}

        {/* Mobile Search Button */}
        {showSearch && (
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full"
            onClick={() => {
              setMobileSearchOpen(true);
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
          >
            <Search className="w-5 h-5" />
          </Button>
        )}

        <div className="flex items-center gap-2 ml-auto lg:ml-6">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full smooth"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              {resolvedTheme === "dark" ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full h-9 px-4 text-sm font-medium smooth" asChild>
              <Link href="/pricing">Pricing</Link>
            </Button>
            
            {isLoggedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-foreground hover:bg-foreground/5 rounded-full h-10 p-2 text-sm font-medium smooth border border-blue-500/30 hover:border-blue-500/50 gap-2"
                  >
                    <div className="w-7 h-7 shrink-0 rounded-full bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <span className="text-sm text-white font-semibold">
                        {user?.name?.charAt(0).toUpperCase() ?? "U"}
                      </span>
                    </div>
                    <span className="max-w-[100px] truncate sm:max-w-[140px] md:max-w-none">
                      {user?.name ?? "Account"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-64 bg-card/95 backdrop-blur-xl border border-blue-500/20 rounded-xl p-2 shadow-xl"
                >
                  {[
                    { icon: User, label: "Profile", href: "/profile" },
                    { icon: Sparkles, label: "My generations", href: "/profile/generations" },
                    { icon: ShoppingBag, label: "My purchases", href: "/profile/purchases" },
                    { icon: CreditCard, label: "My subscriptions", href: "/profile/subscriptions" },
                    { icon: Download, label: "My downloads", href: "/profile/downloads" },
                    { icon: Bookmark, label: "Favorites", href: "/profile/favorites" },
                  ].map(({ icon: Icon, label, href }) => (
                    <DropdownMenuItem key={label} asChild className="cursor-pointer rounded-lg px-3 py-3">
                      <Link href={href} className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-blue-400" />
                        <span>{label}</span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator className="bg-border/50" />
                  <DropdownMenuItem
                    variant="destructive"
                    className="cursor-pointer rounded-lg px-3 py-3"
                    onClick={() => void signOut()}
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full h-9 px-4 text-sm font-medium smooth"
                  onClick={openSignInModal}
                >
                  Sign In
                </Button>
                <Button
                  onClick={openSignUpModal}
                  className="bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-full h-9 px-5 text-sm font-medium smooth shadow-lg shadow-blue-500/25"
                >
                  Sign Up
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      
      <SignInModal
        open={signInOpen}
        onOpenChange={setSignInOpen}
        initialMode={authModalMode}
        onAuthSuccess={() => setSignInOpen(false)}
      />

      {/* Mobile Search Overlay */}
      {showSearch && mobileSearchOpen && (
        <div
          className="fixed inset-0 z-[70] bg-background/95 backdrop-blur-xl lg:hidden"
          onClick={() => setMobileSearchOpen(false)}
        >
          <div className="border-b border-border/50 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => setMobileSearchOpen(false)}
              >
                <X className="w-5 h-5" />
              </Button>
              <div
                className={cn(
                  "flex h-11 flex-1 items-center rounded-full border px-2.5 transition-all duration-200",
                  mobileSearchFocused
                    ? "border-blue-500/70 bg-linear-to-r from-blue-500/15 to-blue-900/20"
                    : "border-blue-500/35 bg-linear-to-r from-blue-500/8 to-blue-900/12"
                )}
              >
                {mobileSearchFocused && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-7 rounded-full border border-blue-500/30 bg-blue-500/15 px-2.5 text-xs text-foreground hover:bg-blue-500/20"
                      >
                        {searchCategoryLabel}
                        <ChevronDown className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-popover border-border">
                      {SEARCH_CATEGORY_OPTIONS.map((category) => (
                        <DropdownMenuItem
                          key={category}
                          onClick={() => handleSearchCategorySelect(category)}
                          className={cn(
                            "text-popover-foreground hover:bg-secondary",
                            category === searchCategory && "bg-secondary"
                          )}
                        >
                          {category}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Search className={cn("h-4 w-4 shrink-0 text-muted-foreground", mobileSearchFocused ? "ml-2" : "ml-1")} />
                <Input
                  ref={searchInputRef}
                  type="search"
                  placeholder={mobileSearchFocused ? `Try "hip hop", "meditation", "tutorial"...` : "Search"}
                  value={searchQuery}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  className="h-9 flex-1 border-0 bg-transparent px-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <button
                type="button"
                onClick={() => setMobileSearchOpen(false)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
