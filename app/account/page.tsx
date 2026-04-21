"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";

function AccountContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, refresh } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const checkoutStatus = params.get("checkout");
  const isSuccess = checkoutStatus === "success";

  useEffect(() => {
    if (!isSuccess) return;
    setRefreshing(true);
    const t = setTimeout(async () => {
      try {
        await refresh();
      } finally {
        setRefreshing(false);
      }
    }, 1500);

    toast.success("Payment received! Your subscription is being activated.");
    return () => clearTimeout(t);
  }, [isSuccess, refresh]);

  const clearStatus = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState({}, "", url.pathname + url.search);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-3xl mx-auto px-6 py-12">
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-12"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </button>

        {isSuccess ? (
          <div className="relative rounded-3xl border border-blue-500/30 bg-card/80 backdrop-blur-sm p-10 shadow-xl shadow-blue-500/10">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-emerald-500/30 blur-2xl rounded-full" />
                <div className="relative w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
              </div>

              <h1 className="text-3xl md:text-4xl font-semibold text-foreground mb-3 tracking-tight">
                Payment successful
              </h1>
              <p className="text-muted-foreground max-w-md leading-relaxed mb-2">
                Thank you{user?.name ? `, ${user.name}` : ""}! Your subscription is being
                activated. This usually takes just a few seconds.
              </p>
              <p className="text-muted-foreground text-sm mb-8">
                A receipt has been sent to{" "}
                <span className="text-foreground">{user?.email ?? "your email"}</span>.
              </p>

              {refreshing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Activating your subscription…
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Button
                  asChild
                  onClick={clearStatus}
                  className="h-12 px-6 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/25"
                >
                  <Link href="/profile/subscriptions">
                    View my subscription
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  onClick={clearStatus}
                  className="h-12 px-6 rounded-xl border-blue-500/30 bg-blue-500/10 text-foreground hover:bg-blue-500/20"
                >
                  <Link href="/">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Start exploring
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-10 pt-8 border-t border-blue-500/10 grid sm:grid-cols-3 gap-4 text-sm">
              <Link
                href="/profile/downloads"
                className="rounded-xl border border-blue-500/20 bg-card/40 p-4 hover:border-blue-500/40 transition-colors"
              >
                <div className="text-foreground font-medium mb-1">Downloads</div>
                <div className="text-muted-foreground">Browse and download templates</div>
              </Link>
              <Link
                href="/profile/subscriptions"
                className="rounded-xl border border-blue-500/20 bg-card/40 p-4 hover:border-blue-500/40 transition-colors"
              >
                <div className="text-foreground font-medium mb-1">Subscription</div>
                <div className="text-muted-foreground">Manage billing &amp; plan</div>
              </Link>
              <Link
                href="/profile"
                className="rounded-xl border border-blue-500/20 bg-card/40 p-4 hover:border-blue-500/40 transition-colors"
              >
                <div className="text-foreground font-medium mb-1">Profile</div>
                <div className="text-muted-foreground">Account settings</div>
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-blue-500/20 bg-card/80 backdrop-blur-sm p-10 text-center">
            <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-3 tracking-tight">
              Account
            </h1>
            <p className="text-muted-foreground mb-6">
              Manage your profile, subscription, and downloads.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild className="h-11 px-5 rounded-xl">
                <Link href="/profile">Profile settings</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 px-5 rounded-xl">
                <Link href="/profile/subscriptions">My subscriptions</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 px-5 rounded-xl">
                <Link href="/pricing">View pricing</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      }
    >
      <AccountContent />
    </Suspense>
  );
}
