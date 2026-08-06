"use client";

import { useAuth } from "@/components/auth-provider";
import { AuthorHeaderNavPopovers } from "@/components/author-header-nav-popovers";
import { MainHeaderAuthorsPopover } from "@/components/main-header-authors-popover";
import { SignInModal } from "@/components/sign-in-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { motionflowMainSiteUrl, motionflowSiteOrigin } from "@/lib/motionflow-urls";
import { SEARCH_CATEGORY_OPTIONS, searchCategoryHref, type SearchCategory } from "@/lib/search-categories";
import { cn } from "@/lib/utils";
import { Bookmark, ChevronDown, CreditCard, Download, LogOut, Package, Search, ShoppingBag, Sparkles, User, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface HeaderProps {
  showSearch: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchCategory: SearchCategory;
  onSearchCategoryChange: (category: SearchCategory) => void;
  sidebarCollapsed?: boolean;
  containerClassName?: string;
  fixed?: boolean;
  showBrand?: boolean;
  /** Stock Assets / AI Tools popovers linking to the main Motion Flow site (author storefront headers). */
  authorNavPopovers?: boolean;
}

export function Header({
  showSearch,
  searchQuery,
  onSearchChange,
  searchCategory,
  onSearchCategoryChange,
  sidebarCollapsed,
  containerClassName,
  fixed = true,
  showBrand,
  authorNavPopovers = false,
}: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false);
  const [mobileSearchFocused, setMobileSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelAccountMenuCloseTimer = () => {
    if (accountMenuCloseTimerRef.current !== null) {
      clearTimeout(accountMenuCloseTimerRef.current);
      accountMenuCloseTimerRef.current = null;
    }
  };

  const openAccountMenu = () => {
    cancelAccountMenuCloseTimer();
    setAccountMenuOpen(true);
  };

  const scheduleAccountMenuClose = () => {
    cancelAccountMenuCloseTimer();
    accountMenuCloseTimerRef.current = setTimeout(() => {
      setAccountMenuOpen(false);
      accountMenuCloseTimerRef.current = null;
    }, 150);
  };

  const isLoggedIn = !!user;
  /** Author storefront (e.g. spunkram.*): account and home must target the main site, not the subdomain. */
  const accountMenuHref = (href: string) => (authorNavPopovers ? motionflowMainSiteUrl(href) : href);
  const desktopLeftClass = typeof sidebarCollapsed === "boolean" ? (sidebarCollapsed ? "lg:left-[72px]" : "lg:left-72") : "lg:left-0";
  const positionClass = fixed ? `fixed top-0 right-0 left-0 ${desktopLeftClass}` : "relative";

  const openSignInModal = () => {
    setAuthModalMode("signin");
    setSignInOpen(true);
  };

  const openSignUpModal = () => {
    setAuthModalMode("signup");
    setSignInOpen(true);
  };

  useEffect(() => () => cancelAccountMenuCloseTimer(), []);

  const searchCategoryLabel = searchCategory || "Category";
  const searchPlaceholder = desktopSearchFocused ? `Try "hip hop", "meditation", "tutorial"...` : "Search";

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
    <header
      className={`z-50 bg-background/80 backdrop-blur-xl border-b border-border/50 transition-all duration-300 ${positionClass}`}
    >
      <div
        className={cn("flex h-16 items-center gap-2 px-4 sm:px-5 lg:px-6", showSearch && !showBrand && "lg:gap-6", containerClassName)}
      >
        {/* Spacer for fixed mobile hamburger (sidebar) */}
        <div className={cn("shrink-0 lg:hidden", showSearch || !showBrand ? "w-10 sm:w-12" : "w-0")} aria-hidden />

        {/* Desktop Search */}
        {showSearch && (
          <div className="hidden min-w-0 flex-1 items-center lg:flex lg:max-w-3xl">
            <div
              className={cn(
                "flex h-12 w-full items-center rounded-full border px-3 transition-all duration-200",
                desktopSearchFocused
                  ? "border-blue-500/70 bg-transparent shadow-[0_0_0_2px_rgba(59,130,246,0.25)]"
                  : "border-blue-500/35 bg-transparent hover:border-blue-500/55",
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
                          className={cn("text-popover-foreground hover:bg-secondary", category === searchCategory && "bg-secondary")}
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
                className="h-full min-h-0 flex-1 border-0 bg-transparent px-3 py-0 text-sm leading-normal text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>
        )}

        {/* Mobile Search Button */}
        {showSearch && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full"
            onClick={() => {
              setMobileSearchOpen(true);
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
          >
            <Search className="w-5 h-5" />
          </Button>
        )}

        {showBrand && (
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <Link href={motionflowSiteOrigin()} className="group flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center smooth group-hover:scale-105">
                <Image
                  src="/images/logo.png"
                  alt="Motion Flow"
                  width={36}
                  height={36}
                  className="h-full w-full object-contain invert dark:invert-0"
                />
              </div>
              <span
                className={cn(
                  "overflow-hidden whitespace-nowrap font-semibold text-lg tracking-tight text-foreground transition-[opacity,max-width] duration-300 ease-out",
                  "max-w-[180px] opacity-100",
                )}
              >
                Motion Flow
              </span>
            </Link>
            {authorNavPopovers ? <AuthorHeaderNavPopovers /> : null}
          </div>
        )}

        <div className={cn("ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-2", !showBrand && !showSearch && "lg:ml-6")}>
          {!showBrand && (
            <div className="hidden lg:flex items-center gap-2">
              <MainHeaderAuthorsPopover />
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full h-9 px-4 text-sm font-medium smooth"
                asChild
              >
                <Link href="/pricing">Pricing</Link>
              </Button>
            </div>
          )}

          {isLoggedIn ? (
            <DropdownMenu
              modal={false}
              open={accountMenuOpen}
              onOpenChange={(next) => {
                cancelAccountMenuCloseTimer();
                setAccountMenuOpen(next);
              }}
            >
              <div onMouseEnter={openAccountMenu} onMouseLeave={scheduleAccountMenuClose}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 w-10 shrink-0 rounded-full border border-blue-500/30 p-0 text-sm font-medium text-foreground smooth hover:border-blue-500/50 hover:bg-foreground/5 sm:w-auto sm:gap-2 sm:px-2"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-blue-600">
                      <span className="text-sm text-white font-semibold">{user?.name?.charAt(0).toUpperCase() ?? "U"}</span>
                    </div>
                    <span className="hidden sm:inline max-w-[100px] truncate md:max-w-none">{user?.name ?? "Account"}</span>
                  </Button>
                </DropdownMenuTrigger>
              </div>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-64 bg-card/95 backdrop-blur-xl border border-blue-500/20 rounded-xl p-2 shadow-xl"
                onMouseEnter={openAccountMenu}
                onMouseLeave={scheduleAccountMenuClose}
              >
                {[
                  { icon: User, label: "Profile", href: "/profile" },
                  { icon: Sparkles, label: "My generations", href: "/profile/generations" },
                  { icon: ShoppingBag, label: "My purchases", href: "/profile/purchases" },
                  { icon: CreditCard, label: "My subscriptions", href: "/profile/subscriptions" },
                  { icon: Download, label: "My downloads", href: "/profile/downloads" },
                  { icon: Bookmark, label: "Favorites", href: "/profile/favorites" },
                  ...(user?.email?.trim().toLowerCase() === "basepackagehelp@gmail.com"
                    ? [{ icon: Package, label: "Packages", href: "/profile/packages" }]
                    : []),
                ].map(({ icon: Icon, label, href }) => (
                  <DropdownMenuItem
                    key={label}
                    asChild
                    className={cn(
                      "cursor-pointer rounded-xl px-3 py-2.5 font-medium outline-none transition-all duration-150",
                      "text-foreground/90 focus:bg-transparent focus:text-foreground/90",
                      "hover:bg-linear-to-r hover:from-blue-500/35 hover:to-brand-500/28 hover:text-white",
                      "hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]",
                      "focus-visible:bg-linear-to-r focus-visible:from-blue-500/35 focus-visible:to-brand-500/28 focus-visible:text-white",
                      "focus-visible:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]",
                      "data-highlighted:bg-linear-to-r data-highlighted:from-blue-500/35 data-highlighted:to-brand-500/28",
                      "data-highlighted:text-white data-highlighted:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]",
                      "[&_svg]:text-blue-400 [&_svg]:transition-colors hover:[&_svg]:text-white focus-visible:[&_svg]:text-white",
                      "data-highlighted:[&_svg]:text-white",
                    )}
                  >
                    <Link href={accountMenuHref(href)} className="flex items-center gap-3">
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="min-w-0">{label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-border/50" />
                <DropdownMenuItem
                  variant="destructive"
                  className={cn(
                    "cursor-pointer rounded-xl px-3 py-2.5 font-medium outline-none transition-all duration-150",
                    "text-destructive focus:bg-transparent",
                    "hover:bg-linear-to-r hover:from-red-600/45 hover:to-red-500/30",
                    "hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]",
                    "hover:text-white hover:[&_svg]:!text-white",
                    "focus-visible:bg-linear-to-r focus-visible:from-red-600/45 focus-visible:to-red-500/30 focus-visible:text-white focus-visible:[&_svg]:!text-white",
                    "focus-visible:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]",
                    "data-highlighted:bg-linear-to-r data-highlighted:from-red-600/45 data-highlighted:to-red-500/30",
                    "data-highlighted:text-white data-highlighted:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]",
                    "data-[variant=destructive]:data-highlighted:text-white data-[variant=destructive]:data-highlighted:[&_svg]:!text-white",
                    "[&_svg]:text-red-400 [&_svg]:transition-colors",
                  )}
                  onClick={() => void signOut()}
                >
                  <LogOut className="h-5 w-5 shrink-0" />
                  <span className="transition-colors">Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button
                variant="ghost"
                className="hidden md:inline-flex text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full h-9 px-4 text-sm font-medium smooth"
                onClick={openSignInModal}
              >
                Sign In
              </Button>
              <Button
                onClick={openSignUpModal}
                className="bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-full h-9 px-3 sm:px-5 text-xs sm:text-sm font-medium smooth shadow-lg shadow-blue-500/25"
              >
                Sign Up
              </Button>
            </>
          )}
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
        <div className="fixed inset-0 z-70 bg-background/95 backdrop-blur-xl lg:hidden" onClick={() => setMobileSearchOpen(false)}>
          <div className="flex h-16 items-center gap-2 border-b border-border/50 px-4 sm:px-5" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="size-10 shrink-0" onClick={() => setMobileSearchOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
            <div
              className={cn(
                "flex h-12 min-w-0 flex-1 items-center rounded-full border px-2.5 transition-all duration-200",
                mobileSearchFocused ? "border-blue-500/70 bg-transparent" : "border-blue-500/35 bg-transparent",
              )}
            >
              {mobileSearchFocused && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-8 shrink-0 self-center rounded-full border border-blue-500/30 bg-blue-500/15 px-2.5 text-xs text-foreground hover:bg-blue-500/20"
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
                        className={cn("text-popover-foreground hover:bg-secondary", category === searchCategory && "bg-secondary")}
                      >
                        {category}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Search className={cn("h-4 w-4 shrink-0 self-center text-muted-foreground", mobileSearchFocused ? "ml-2" : "ml-1")} />
              <Input
                ref={searchInputRef}
                type="search"
                placeholder={mobileSearchFocused ? `Try "hip hop", "meditation", "tutorial"...` : "Search"}
                value={searchQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                className="h-full min-h-0 flex-1 self-center border-0 bg-transparent px-2 py-0 text-sm leading-normal text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <button
              type="button"
              onClick={() => setMobileSearchOpen(false)}
              className="flex h-10 shrink-0 items-center px-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
