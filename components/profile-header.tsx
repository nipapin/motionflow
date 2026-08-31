"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bookmark,
  CreditCard,
  Download,
  LogOut,
  ShoppingBag,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { SignInModal } from "@/components/sign-in-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { profilePageClassForPath } from "@/lib/profile-layout";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

const PACKAGES_ADMIN_EMAILS = new Set(["basepackagehelp@gmail.com"]);

const ACCOUNT_LINKS = [
  { icon: User, label: "Profile", href: "/profile" },
  { icon: Sparkles, label: "My generations", href: "/profile/generations" },
  { icon: ShoppingBag, label: "My purchases", href: "/profile/purchases" },
  { icon: CreditCard, label: "My subscriptions", href: "/profile/subscriptions" },
  { icon: Download, label: "My downloads", href: "/profile/downloads" },
  { icon: Bookmark, label: "Favorites", href: "/profile/favorites" },
] as const;

export function ProfileHeader() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
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

  useEffect(() => () => cancelAccountMenuCloseTimer(), []);

  const isLoggedIn = !!user;

  return (
    <>
      <header className="fixed top-0 right-0 left-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className={cn(profilePageClassForPath(pathname), "flex h-16 items-center justify-between gap-4")}>
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center smooth group-hover:scale-105">
              <Image
                src="/images/logo.png"
                alt="Motion Flow"
                width={36}
                height={36}
                className="h-full w-full object-contain invert dark:invert-0"
              />
            </div>
            <span className="truncate font-semibold text-lg tracking-tight text-foreground">
              Motion Flow
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              className="h-9 rounded-full px-4 text-sm font-medium text-muted-foreground smooth hover:bg-foreground/5 hover:text-foreground"
              asChild
            >
              <Link href="/pricing">Pricing</Link>
            </Button>
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
                        <span className="text-sm font-semibold text-white">
                          {user?.name?.charAt(0).toUpperCase() ?? "U"}
                        </span>
                      </div>
                      <span className="hidden max-w-[100px] truncate sm:inline md:max-w-none">
                        {user?.name ?? "Account"}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                </div>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-64 rounded-xl border border-blue-500/20 bg-card/95 p-2 shadow-xl backdrop-blur-xl"
                  onMouseEnter={openAccountMenu}
                  onMouseLeave={scheduleAccountMenuClose}
                >
                  {[
                    ...ACCOUNT_LINKS,
                    ...(user?.email && PACKAGES_ADMIN_EMAILS.has(user.email.trim().toLowerCase())
                      ? ([{ icon: Users, label: "Authors", href: "/profile/packages" }] as const)
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
                      <Link href={href} className="flex items-center gap-3">
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
                  className="hidden h-9 rounded-full px-4 text-sm font-medium text-muted-foreground smooth hover:bg-foreground/5 hover:text-foreground md:inline-flex"
                  onClick={() => {
                    setAuthModalMode("signin");
                    setSignInOpen(true);
                  }}
                >
                  Sign In
                </Button>
                <Button
                  onClick={() => {
                    setAuthModalMode("signup");
                    setSignInOpen(true);
                  }}
                  className="h-9 rounded-full bg-linear-to-r from-blue-600 to-blue-500 px-3 text-xs font-medium text-white shadow-lg shadow-blue-500/25 smooth hover:from-blue-500 hover:to-blue-400 sm:px-5 sm:text-sm"
                >
                  Sign Up
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <SignInModal
        open={signInOpen}
        onOpenChange={setSignInOpen}
        initialMode={authModalMode}
        onAuthSuccess={() => setSignInOpen(false)}
      />
    </>
  );
}
