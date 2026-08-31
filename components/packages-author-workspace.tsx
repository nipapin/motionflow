"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Package, Puzzle } from "lucide-react";
import { ExtensionsUsersList } from "@/components/extensions-users-list";
import { PackagesProjectList } from "@/components/packages-project-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getPackagesAuthorPublicById,
  packagesAuthorLogoUrl,
} from "@/lib/packages-admin-client";

type AuthorTab = "packages" | "users";

const TAB_TRIGGER_CLASS =
  "h-9 text-xs sm:text-sm px-3 text-muted-foreground data-[state=active]:border-transparent data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-blue-500/25";

function isAuthorTab(value: string): value is AuthorTab {
  return value === "packages" || value === "users";
}

export function PackagesAuthorWorkspace({ authorId }: { authorId: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const seed = getPackagesAuthorPublicById(authorId);

  const [label, setLabel] = useState(seed?.label ?? `Author ${authorId}`);
  const [logoUrl, setLogoUrl] = useState(
    seed?.logoUrl ?? packagesAuthorLogoUrl(authorId),
  );

  const tab = useMemo<AuthorTab>(() => {
    const raw = searchParams.get("tab") ?? "";
    return isAuthorTab(raw) ? raw : "packages";
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/packages/authors/${authorId}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          author?: { label: string; logoUrl?: string };
        };
        if (cancelled || !data.author) return;
        setLabel(data.author.label);
        if (data.author.logoUrl) setLogoUrl(data.author.logoUrl);
      } catch {
        /* keep seed */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  const handleTabChange = useCallback(
    (value: string) => {
      if (!isAuthorTab(value)) return;
      const params = new URLSearchParams(searchParams.toString());
      if (value === "packages") params.delete("tab");
      else params.set("tab", value);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="w-full space-y-5">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Link
          href="/profile/packages"
          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All authors
        </Link>
        <span className="text-muted-foreground/40" aria-hidden>
          /
        </span>
        <span className="text-foreground/80">{label}</span>
      </nav>

      <div className="flex items-start gap-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          className="mt-0.5 h-11 w-11 rounded-lg bg-muted/60 object-contain p-1.5"
        />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{label}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {tab === "users"
              ? "Users with active CEP devices for this author."
              : "CEP packages for this author"}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="gap-6">
        <TabsList className="h-auto w-fit gap-1 rounded-lg border border-blue-500/25 bg-muted/40 p-1">
          <TabsTrigger value="packages" className={TAB_TRIGGER_CLASS}>
            <Package className="h-4 w-4" />
            Packages
          </TabsTrigger>
          <TabsTrigger value="users" className={TAB_TRIGGER_CLASS}>
            <Puzzle className="h-4 w-4" />
            Users
          </TabsTrigger>
        </TabsList>
        <TabsContent value="packages" className="outline-none">
          <PackagesProjectList authorId={authorId} />
        </TabsContent>
        <TabsContent value="users" className="outline-none">
          <ExtensionsUsersList authorId={authorId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
