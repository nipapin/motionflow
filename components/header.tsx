"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Search, Moon, Sun, User, ShoppingBag, CreditCard, Download, Bookmark, LogOut, X, Sparkles } from "lucide-react";
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

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sidebarCollapsed?: boolean;
}

export function Header({ searchQuery, onSearchChange, sidebarCollapsed }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
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

  return (
    <header className={`fixed top-0 right-0 left-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50 transition-all duration-300 ${sidebarCollapsed ? 'lg:left-[72px]' : 'lg:left-72'}`}>
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Spacer for mobile hamburger */}
        <div className="w-12 lg:hidden" />
        
        {/* Desktop Search */}
        <div className="hidden md:block flex-1 max-w-xl">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search templates, music, sound effects..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-11 bg-foreground/5 border-transparent hover:bg-foreground/[0.07] focus:bg-foreground/[0.07] focus:border-border h-10 text-foreground placeholder:text-muted-foreground rounded-full text-sm smooth"
            />
          </div>
        </div>

        {/* Mobile Search Button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full"
          onClick={() => {
            setMobileSearchOpen(true);
            setTimeout(() => searchInputRef.current?.focus(), 100);
          }}
        >
          <Search className="w-5 h-5" />
        </Button>

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
              <div className="relative group">
                <Button 
                  variant="ghost" 
                  className="text-foreground hover:bg-foreground/5 rounded-full h-10 p-2 text-sm font-medium smooth border border-blue-500/30 hover:border-blue-500/50 gap-2"
                >
                  <div className="w-7 h-7 rounded-full bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <span className="text-sm text-white font-semibold">{user?.name?.charAt(0).toUpperCase() ?? "U"}</span>
                  </div>
                  {user?.name ?? "Account"}
                </Button>
                <div className="absolute right-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className="w-64 bg-card/95 backdrop-blur-xl border border-blue-500/20 rounded-xl p-3 shadow-xl">
                    <div className="flex flex-col gap-1">
                      {[
                        { icon: User, label: "Profile", href: "/profile" },
                        { icon: Sparkles, label: "My generations", href: "/profile/generations" },
                        { icon: ShoppingBag, label: "My purchases", href: "/profile/purchases" },
                        { icon: CreditCard, label: "My subscriptions", href: "/profile/subscriptions" },
                        { icon: Download, label: "My downloads", href: "/profile/downloads" },
                        { icon: Bookmark, label: "Favorites", href: "/profile/favorites" },
                      ].map(({ icon: Icon, label, href }) => (
                        <Link
                          key={label}
                          href={href}
                          className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-foreground/5 smooth text-left"
                        >
                          <Icon className="w-5 h-5 text-blue-400" />
                          <span className="text-sm text-foreground">{label}</span>
                        </Link>
                      ))}
                      <div className="h-px bg-border/50 my-1" />
                      <button
                        type="button"
                        onClick={() => void signOut()}
                        className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-foreground/5 smooth text-left text-red-400"
                      >
                        <LogOut className="w-5 h-5" />
                        <span className="text-sm">Sign out</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
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
      {mobileSearchOpen && (
        <div className="fixed inset-0 z-[70] bg-background/95 backdrop-blur-xl md:hidden">
          <div className="flex items-center gap-3 p-4 border-b border-border/50">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setMobileSearchOpen(false)}
            >
              <X className="w-5 h-5" />
            </Button>
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="search"
                placeholder="Search templates, music, sound effects..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-11 bg-foreground/5 border-transparent h-11 text-foreground placeholder:text-muted-foreground rounded-full text-sm w-full"
              />
            </div>
          </div>
          {searchQuery && (
            <div className="p-4">
              <p className="text-sm text-muted-foreground">Searching for &quot;{searchQuery}&quot;...</p>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
