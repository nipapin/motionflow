import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import {
  getModerationItemsPage,
  getModerationTabCounts,
  parseModerationTab,
} from "@/lib/admin/items-moderation";
import { ModerationTabs } from "@/components/admin/moderation-tabs";
import { ModerationItemCard } from "@/components/admin/moderation-item-card";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = {
  title: "Items — Admin",
};

export const dynamic = "force-dynamic";

const PER_PAGE = 30;

type PageProps = {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{ page?: string; focus?: string }>;
};

export default async function AdminItemsAccessPage({ params, searchParams }: PageProps) {
  ensureInvestor(await getSessionUser());
  const { segments } = await params;
  const sp = await searchParams;
  const tab = parseModerationTab(segments?.[0]);
  const page = Math.max(1, Number(sp.page) || 1);
  const focusId = sp.focus ? Number(sp.focus) : NaN;
  const focus = Number.isFinite(focusId) && focusId > 0 ? focusId : undefined;

  const [counts, { items, total }] = await Promise.all([getModerationTabCounts(), getModerationItemsPage(tab, page)]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-6">
      <ModerationTabs active={tab} counts={counts} />

      {items.length === 0 ? (
        <Empty className="border border-border/60 bg-muted/10">
          <EmptyHeader>
            <EmptyTitle>No items in this queue</EmptyTitle>
            <EmptyDescription>Switch tabs or check back later.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {items.map((row) => (
            <ModerationItemCard key={row.id} row={row} focus={focus === row.id} />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex justify-center gap-2 pt-2">
          {page > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/adminzone/items_access/${tab}?page=${page - 1}`}>Previous</Link>
            </Button>
          ) : null}
          <span className="flex items-center px-2 text-sm text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/adminzone/items_access/${tab}?page=${page + 1}`}>Next</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
