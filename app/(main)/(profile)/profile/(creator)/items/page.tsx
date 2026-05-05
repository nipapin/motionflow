import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  type ContributorItemRow,
  getContributorItemsPage,
  contributorPreviewUrl,
  itemAccessBadge,
} from "@/lib/author/items";
import { UPLOAD_CATEGORIES } from "@/lib/author/upload-categories";
import { Button } from "@/components/ui/button";
import { normalizeProductFiles, productSoftwareLabel, productThumbnailUrl } from "@/lib/product-ui";
import { motionflowItemPageUrl } from "@/lib/motionflow-urls";
import type { Product } from "@/lib/product-types";
import { AuthorItemCard } from "@/components/dashboard/author-item-card";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { ItemsEmptyState } from "@/components/dashboard/items-empty-state";
import { ItemsScopeToggle } from "@/components/dashboard/items-scope-toggle";

export const metadata: Metadata = {
  title: "Items",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ team?: string; page?: string }>;
};

function stubProduct(row: ContributorItemRow): Product {
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
    files: normalizeProductFiles(row.files),
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
    <div className="space-y-8">
      <DashboardPageHeader
        title="Items"
        description={
          <>
            <span className="tabular-nums text-foreground">{total}</span>
            <span>
              {" "}
              project{total === 1 ? "" : "s"}
              {team ? " · Team view" : ""}
            </span>
          </>
        }
        actions={<ItemsScopeToggle team={team} />}
      />

      {items.length === 0 ? (
        <ItemsEmptyState team={team} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const p = stubProduct(item);
            const preview = productThumbnailUrl(p) || contributorPreviewUrl(item);
            const badge = itemAccessBadge(item.access);
            const categoryKey = item.index_category_slug.toLowerCase();
            const canEdit =
              item.author_id === user.id && UPLOAD_CATEGORIES.some((c) => c.slug === categoryKey);
            const editHref = `/profile/upload/${item.index_category_slug}?item=${item.id}`;
            return (
              <AuthorItemCard
                key={item.id}
                itemId={item.id}
                name={item.name}
                previewUrl={preview}
                softwareLabel={productSoftwareLabel(p)}
                statusLabel={badge.label}
                access={item.access}
                canEdit={canEdit}
                editHref={editHref}
                marketplaceHref={motionflowItemPageUrl(p, item.id, item.name)}
              />
            );
          })}
        </div>
      )}

      {total > 24 ? (
        <div className="flex justify-center gap-2 pt-2">
          {page > 1 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-lg border-primary/45 px-4 text-[13px] font-medium text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
              asChild
            >
              <Link href={`/profile/items${team ? "?team=1&" : "?"}page=${page - 1}`}>Previous</Link>
            </Button>
          ) : null}
          {page * 24 < total ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-lg border-primary/45 px-4 text-[13px] font-medium text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
              asChild
            >
              <Link href={`/profile/items${team ? "?team=1&" : "?"}page=${page + 1}`}>Next</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
