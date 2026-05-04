import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  getCouponsForAuthor,
  getSearchQueriesForMarketing,
  getUpdateNotificationsForAuthor,
} from "@/lib/author/marketing";
import { CouponCreateForm } from "@/components/author/coupon-create-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

type Section = "coupons" | "search-queries" | "update-notifications";

type PageProps = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ sort?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { section } = await params;
  return { title: `Marketing — ${section}` };
}

export default async function MarketingSectionPage({ params, searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const { section: raw } = await params;
  const section = raw as Section;
  if (!["coupons", "search-queries", "update-notifications"].includes(section)) notFound();

  const sp = await searchParams;
  const sort = sp.sort ?? "updated_at";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marketing</h1>
          <p className="text-muted-foreground">Coupons, search analytics, and buyer update notifications.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={section === "coupons" ? "default" : "outline"} asChild>
            <Link href="/profile/marketing/coupons">Coupons</Link>
          </Button>
          <Button size="sm" variant={section === "search-queries" ? "default" : "outline"} asChild>
            <Link href="/profile/marketing/search-queries">Search queries</Link>
          </Button>
          <Button size="sm" variant={section === "update-notifications" ? "default" : "outline"} asChild>
            <Link href="/profile/marketing/update-notifications">Update notifications</Link>
          </Button>
        </div>
      </div>

      {section === "coupons" ? (
        <CouponsSection userId={user.id} />
      ) : section === "search-queries" ? (
        <SearchQueriesSection sort={sort} />
      ) : (
        <UpdateNotificationsSection userId={user.id} />
      )}
    </div>
  );
}

async function CouponsSection({ userId }: { userId: number }) {
  const rows = await getCouponsForAuthor(userId);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CouponCreateForm />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your coupons</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Uses</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm">{c.code}</TableCell>
                  <TableCell className="capitalize">{c.type}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.amount}</TableCell>
                  <TableCell className="text-right text-sm">
                    {c.uses}
                    {c.maxUses != null ? ` / ${c.maxUses}` : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

async function SearchQueriesSection({ sort }: { sort: string }) {
  const rows = await getSearchQueriesForMarketing(40, sort);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Search queries</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant={sort === "updated_at" ? "default" : "outline"} asChild>
            <Link href="/profile/marketing/search-queries?sort=updated_at">Latest</Link>
          </Button>
          <Button size="sm" variant={sort === "views" ? "default" : "outline"} asChild>
            <Link href="/profile/marketing/search-queries?sort=views">Max views</Link>
          </Button>
          <Button size="sm" variant={sort === "found" ? "default" : "outline"} asChild>
            <Link href="/profile/marketing/search-queries?sort=found">Max found</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Query</TableHead>
              <TableHead>Section</TableHead>
              <TableHead className="text-right">Found</TableHead>
              <TableHead className="text-right">Views</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={`${r.query}-${i}`}>
                <TableCell className="max-w-[240px] truncate font-medium">{r.query}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{r.section}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.found}</TableCell>
                <TableCell className="text-right tabular-nums text-primary">{r.views}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

async function UpdateNotificationsSection({ userId }: { userId: number }) {
  const rows = await getUpdateNotificationsForAuthor(userId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Update notifications</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Version</TableHead>
              <TableHead className="text-right">Buyers</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.itemName ?? `#${r.itemId}`}</TableCell>
                <TableCell>{r.version ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.countBuyers}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {r.createdAt ? format(new Date(r.createdAt), "dd.MM.yyyy HH:mm") : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
