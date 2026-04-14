"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Moon, Sun, User, ShoppingBag, CreditCard, Download, Bookmark, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { SignInModal } from "@/components/sign-in-modal";
import { useAuth } from "@/components/auth-provider";

export default function ProfileShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");

  const isLoggedIn = !!user;

  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 lg:px-6">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 flex items-center justify-center shrink-0 smooth group-hover:scale-105">
              <Image src="/images/logo.png" alt="Motion Flow" width={36} height={36} className="w-full h-full object-contain dark:invert-0 invert" />
            </div>
            <span className="font-semibold text-lg text-foreground tracking-tight whitespace-nowrap">
              Motion Flow
            </span>
          </Link>

          <div className="flex items-center gap-2">
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

            <Button variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full h-9 px-4 text-sm font-medium smooth" asChild>
              <Link href="/pricing">Pricing</Link>
            </Button>

            {isLoggedIn ? (
              <div className="relative group">
                <Button
                  variant="ghost"
                  className="text-foreground hover:bg-foreground/5 rounded-full h-10 px-4 text-sm font-medium smooth border border-blue-500/30 hover:border-blue-500/50 gap-2"
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
                  onClick={() => { setAuthModalMode("signin"); setSignInOpen(true); }}
                >
                  Sign In
                </Button>
                <Button
                  onClick={() => { setAuthModalMode("signup"); setSignInOpen(true); }}
                  className="bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-full h-9 px-5 text-sm font-medium smooth shadow-lg shadow-blue-500/25"
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

      <main className="relative mx-auto max-w-6xl px-6 pt-26 pb-10">{children}</main>
    </div>
  );
}
