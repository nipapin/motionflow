import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Download } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getContributorItemsPage, contributorPreviewUrl, itemAccessBadge } from "@/lib/author/items";
import { indexCategoryLabel } from "@/lib/author/category-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { productSoftwareLabel } from "@/lib/product-ui";
import { motionflowItemPageUrl } from "@/lib/motionflow-urls";
import type { Product } from "@/lib/product-types";

export const metadata: Metadata = {
  title: "Items",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ team?: string; page?: string }>;
};

function stubProduct(row: { index_category_slug: string; name: string; id: number }): Product {
  return {
    id: row.id,
    author_id: 0,
    access: 1,
    price: 0,
    team: null,
    exclusive: 0,
    subscription: 0,
    index_category_slug: row.index_category_slug,
    sub_category_slug: "",
    name: row.name,
    description: "",
    description_html: null,
    description_json: {},
    tags: "",
    has_qty: 0,
    attributes: {},
    extra: null,
    json_args: null,
    files: {},
    has_demo: null,
    demo_url: null,
    has_external: null,
    external_domain: null,
    external_url: null,
    youtube_preview: null,
    discount_price: null,
    discount_start: null,
    discount_end: null,
    created_at: "",
    updated_at: "",
  };
}

export default async function AuthorItemsPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) return null;
  const sp = await searchParams;
  const team = sp.team === "1" || sp.team === "true";
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total } = await getContributorItemsPage(user.id, { team, page, perPage: 24 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Items</h1>
          <p className="text-muted-foreground">
            You have <span className="font-semibold text-foreground">{total}</span> project
            {total === 1 ? "" : "s"}
            {team ? " (team)" : ""}.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          <Link
            href="/profile/items"
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium smooth",
              !team ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            My items
          </Link>
          <Link
            href="/profile/items?team=1"
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium smooth",
              team ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Team items
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => {
          const preview = contributorPreviewUrl(item);
          const badge = itemAccessBadge(item.access);
          const p = stubProduct(item);
          return (
            <Card key={item.id} className="group overflow-hidden border-border/60">
              <div className="relative aspect-video bg-muted">
                {preview ? (
                  <Image
                    src={preview}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No preview
                  </div>
                )}
                {item.access === -10 ? (
                  <Badge className="absolute right-2 top-2 bg-muted-foreground/90 text-xs uppercase">
                    On processing
                  </Badge>
                ) : null}
              </div>
              <CardContent className="space-y-2 p-4">
                <h2 className="line-clamp-2 font-semibold leading-snug">{item.name}</h2>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded border border-border px-1.5 py-0.5 font-medium text-foreground">
                    {productSoftwareLabel(p)}
                  </span>
                  {indexCategoryLabel(item.index_category_slug)}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <Badge variant={badge.variant === "destructive" ? "destructive" : "secondary"}>{badge.label}</Badge>
                  <Button size="icon" className="bg-emerald-600 hover:bg-emerald-700" asChild>
                    <a href={motionflowItemPageUrl(p, item.id, item.name)} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 text-white" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {total > 24 ? (
        <div className="flex justify-center gap-2">
          {page > 1 ? (
            <Button variant="outline" asChild>
              <Link href={`/profile/items${team ? "?team=1&" : "?"}page=${page - 1}`}>Previous</Link>
            </Button>
          ) : null}
          {page * 24 < total ? (
            <Button variant="outline" asChild>
              <Link href={`/profile/items${team ? "?team=1&" : "?"}page=${page + 1}`}>Next</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
