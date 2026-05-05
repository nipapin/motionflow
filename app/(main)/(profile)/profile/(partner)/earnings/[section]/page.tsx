import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAdmin } from "@/lib/auth/access-control";
import {
  type EarningsPeriodKey,
  getDirectSalesRows,
  getSalesPeriodSummary,
  getSubscriptionDownloadAggregates,
  getSubscriptionTotalsFromPayouts,
  getSubscriberRows,
  getSubscriberPlanPie,
  resolvePeriodRange,
  getTotalSubscriptionDownloadCount,
  type DirectSaleRow,
} from "@/lib/author/earnings";
import { getAuthorSubscriptionIncome } from "@/lib/author/dashboard-stats";
import { EarningsLegend } from "@/components/author/earnings-legend";
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
import { motionflowItemPageUrl } from "@/lib/motionflow-urls";
import type { Product } from "@/lib/product-types";

export const dynamic = "force-dynamic";

type Section = "sales" | "subscription" | "subscribers";

type PageProps = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ date?: string; page?: string; from?: string; to?: string }>;
};

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function saleDate(iso: string): string {
  try {
    return format(new Date(iso), "dd.MM.yyyy");
  } catch {
    return iso;
  }
}

function profitForRow(row: DirectSaleRow, _viewerId: number): number {
  if (row.rowKind === "affiliate_ref") return row.refEarn ?? 0;
  if (row.rowKind === "team_co") return row.coEarn ?? 0;
  if (row.rowKind === "team_primary") return row.authorEarn;
  return row.authorEarn;
}

function typeBadge(row: DirectSaleRow): { label: string; className: string } {
  switch (row.rowKind) {
    case "direct":
      return { label: "Direct sale", className: "bg-primary text-primary-foreground" };
    case "team_primary":
    case "team_co":
      return { label: "Team income", className: "bg-emerald-600 text-white" };
    case "affiliate_ref":
      return { label: "Affiliate income", className: "bg-emerald-600 text-white" };
    case "refund":
      return { label: "Refund", className: "bg-zinc-700 text-white" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-destructive text-destructive-foreground" };
    case "waiting":
      return { label: "Waiting", className: "bg-amber-500 text-black" };
    default:
      return { label: "Sale", className: "bg-secondary" };
  }
}

function stubProduct(name: string, slug: string, id: number): Product {
  return {
    id,
    author_id: 0,
    access: 1,
    price: 0,
    team: null,
    exclusive: 0,
    subscription: 0,
    index_category_slug: slug,
    sub_category_slug: "",
    name,
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

const SALES_PERIODS: { key: EarningsPeriodKey; label: string }[] = [
  { key: "current-month", label: "Current month" },
  { key: "previous-month-1", label: "Prev month" },
  { key: "previous-month-2", label: "−2 mo" },
  { key: "previous-month-3", label: "−3 mo" },
  { key: "all-time", label: "All time" },
];

const SUB_PERIODS: { key: EarningsPeriodKey; label: string }[] = [
  { key: "current-month", label: "Current month" },
  { key: "previous-month-1", label: "Prev month" },
  { key: "previous-month-2", label: "−2 mo" },
  { key: "previous-month-3", label: "−3 mo" },
  { key: "all-time", label: "All time" },
];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { section } = await params;
  return { title: section === "sales" ? "Earnings — sales" : `Earnings — ${section}` };
}

export default async function EarningsSectionPage({ params, searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) return null;

  const { section: raw } = await params;
  const section = raw as Section;
  if (section !== "sales" && section !== "subscription" && section !== "subscribers") {
    redirect("/profile/earnings/sales");
  }

  if (section === "subscription" && !isAdmin(user)) {
    redirect("/profile/earnings/sales");
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const dateKey = (sp.date as EarningsPeriodKey | undefined) ?? "current-month";
  const { from, to } = resolvePeriodRange(dateKey, sp.from, sp.to);

  const base = `/profile/earnings/${section}`;

  if (section === "sales") {
    const summary = await getSalesPeriodSummary(user.id, from, to);
    const { rows, total } = await getDirectSalesRows(user.id, { from, to, page, perPage: 20 });

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Earnings &amp; statements</h1>
          <p className="text-muted-foreground">Direct sales, refunds, and affiliate totals for the selected period.</p>
        </div>

        <SectionTabs section={section} isAdmin={isAdmin(user)} />

        <div className="flex flex-wrap gap-2">
          {SALES_PERIODS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={p.key === dateKey ? "default" : "outline"}
              className={
                p.key === dateKey
                  ? undefined
                  : "border-primary/40 text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
              }
              asChild
            >
              <Link href={`${base}?date=${p.key}`}>{p.label}</Link>
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryMini title="Sales" body={`${money(summary.salesEarned)} of ${summary.salesCount} sold`} />
          <SummaryMini title="Affiliate profit" body={`${money(summary.affiliateEarned)} / ${summary.affiliateCount}`} />
          <SummaryMini title="Refunds" body={`${money(summary.refunds)} / ${summary.refundCount}`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transactions</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>Sale price</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const tb = typeBadge(row);
                  const stub = stubProduct(row.itemName, "", row.itemId);
                  const itemUrl = motionflowItemPageUrl(stub, row.itemId, row.itemName);
                  const profit = profitForRow(row, user.id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.id}</TableCell>
                      <TableCell>
                        <Badge className={tb.className}>{tb.label}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <a
                          href={itemUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-md border border-primary/40 px-2 py-1 text-sm font-medium text-primary hover:underline"
                        >
                          Item: {row.itemName}
                        </a>
                        <p className="mt-1 text-xs text-muted-foreground">
                          buyer <span className="font-medium text-foreground">{row.buyerName}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {money(row.soldPrice)} × {row.licenseTitle} × {row.qty} Qty
                        </p>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        <span className="font-semibold text-emerald-600">{money(profit)}</span>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        <div className="font-medium text-primary">{money(row.soldNet)}</div>
                        <div className="text-xs text-destructive">−{money(row.systemTax)} transaction tax</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{saleDate(row.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <PaginationBar base={base} dateKey={dateKey} page={page} total={total} pageSize={20} />
          </CardContent>
        </Card>

        <EarningsLegend />
      </div>
    );
  }

  if (section === "subscription") {
    const dlPage = await getSubscriptionDownloadAggregates(user.id, from, to, { page, perPage: 20 });
    const payoutPart = await getSubscriptionTotalsFromPayouts(user.id, from, to);
    const dlCount = await getTotalSubscriptionDownloadCount(user.id, from, to);
    const weighted =
      from && to ? await getAuthorSubscriptionIncome(user.id, from, to) : { earned: 0, average: 0, count: 0 };

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Earnings — subscription</h1>
          <p className="text-muted-foreground">Admin-only view aligned with Laravel weighting + payout totals.</p>
        </div>
        <SectionTabs section={section} isAdmin />
        <div className="flex flex-wrap gap-2">
          {SUB_PERIODS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={p.key === dateKey ? "default" : "outline"}
              className={
                p.key === dateKey
                  ? undefined
                  : "border-primary/40 text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
              }
              asChild
            >
              <Link href={`${base}?date=${p.key}`}>{p.label}</Link>
            </Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryMini
            title="Weighted income (period)"
            body={money(weighted.earned)}
            sub={`${weighted.count} weighted units`}
          />
          <SummaryMini title="Payout subs (sum)" body={money(payoutPart.subsAmount)} />
          <SummaryMini title="Raw downloads" body={String(dlCount)} sub={`${dlPage.total} items in table`} />
          <SummaryMini title="Bonus (payouts)" body={money(payoutPart.subsBonus)} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Downloads by item</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Downloads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dlPage.rows.map((r) => (
                  <TableRow key={r.originId}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationBar base={base} dateKey={dateKey} page={page} total={dlPage.total} pageSize={20} />
          </CardContent>
        </Card>
        <EarningsLegend />
      </div>
    );
  }

  /* subscribers */
  const subs = await getSubscriberRows(user.id, from, to, { page, perPage: 24 });
  const pie = await getSubscriberPlanPie(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Earnings — subscribers</h1>
        <p className="text-muted-foreground">Active subscription rows attributed to you as author.</p>
      </div>
      <SectionTabs section={section} isAdmin={isAdmin(user)} />
      <div className="flex flex-wrap gap-2">
        {SUB_PERIODS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={p.key === dateKey ? "default" : "outline"}
            className={
              p.key === dateKey
                ? undefined
                : "border-primary/40 text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
            }
            asChild
          >
            <Link href={`${base}?date=${p.key}`}>{p.label}</Link>
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plans</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {pie.map((s) => (
            <Badge key={s.plan} variant="outline">
              {s.plan}: {s.count}
            </Badge>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscribers</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Buyer</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Since</TableHead>
                <TableHead>Ends</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.buyerName}</TableCell>
                  <TableCell className="capitalize">{r.plan}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.amount)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{saleDate(r.createdAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {r.endsAt ? saleDate(r.endsAt) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar base={base} dateKey={dateKey} page={page} total={subs.total} pageSize={24} />
        </CardContent>
      </Card>
      <EarningsLegend />
    </div>
  );
}

function SummaryMini({ title, body, sub }: { title: string; body: string; sub?: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="mt-1 text-sm font-semibold">{body}</p>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function SectionTabs({ section, isAdmin }: { section: Section; isAdmin: boolean }) {
  const tabs: { href: string; label: string; show: boolean }[] = [
    { href: "/profile/earnings/sales", label: "Direct sales", show: true },
    { href: "/profile/earnings/subscription", label: "Subscription", show: isAdmin },
    { href: "/profile/earnings/subscribers", label: "Subscribers", show: true },
  ];
  return (
    <div className="inline-flex flex-wrap gap-2 rounded-lg border border-primary/20 bg-primary/[0.06] p-1 dark:bg-primary/10">
      {tabs
        .filter((t) => t.show)
        .map((t) => {
          const tabSection = t.href.replace("/profile/earnings/", "") as Section;
          const isActive = section === tabSection;
          return (
            <Button
              key={t.href}
              size="sm"
              variant={isActive ? "default" : "outline"}
              className={
                isActive
                  ? undefined
                  : "border-primary/40 text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
              }
              asChild
            >
              <Link href={t.href}>{t.label}</Link>
            </Button>
          );
        })}
    </div>
  );
}

function PaginationBar({
  base,
  dateKey,
  page,
  total,
  pageSize,
}: {
  base: string;
  dateKey: string;
  page: number;
  total: number;
  pageSize: number;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const q = (p: number) => `${base}?date=${encodeURIComponent(dateKey)}&page=${p}`;
  return (
    <div className="mt-4 flex justify-end gap-2">
      {page > 1 ? (
        <Button
          variant="outline"
          size="sm"
          className="border-primary/45 text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
          asChild
        >
          <Link href={q(page - 1)}>Previous</Link>
        </Button>
      ) : null}
      {page < pages ? (
        <Button
          variant="outline"
          size="sm"
          className="border-primary/45 text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
          asChild
        >
          <Link href={q(page + 1)}>Next</Link>
        </Button>
      ) : null}
    </div>
  );
}
