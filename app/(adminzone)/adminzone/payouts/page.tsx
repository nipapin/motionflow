import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor, isAdmin } from "@/lib/auth/access-control";
import {
  ADMIN_PAYOUTS_PER_PAGE,
  PAYOUT_STATUS_META,
  type AdminPayoutStatus,
  getAdminPayouts,
  parseAdminPayoutPeriod,
  parseAdminPayoutStatus,
  periodRange,
} from "@/lib/admin/admin-payouts";
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
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { PayoutRowActions } from "@/components/admin/payout-row-actions";

export const metadata: Metadata = { title: "Payouts — Admin" };
export const dynamic = "force-dynamic";

const STATUS_TABS: AdminPayoutStatus[] = ["awaiting", "approved", "cancelled", "reserved", "unavailable", "any"];
const PERIOD_TABS = [
  { id: "current-month", label: "Current month" },
  { id: "previous-month-1", label: "Last month" },
  { id: "previous-month-2", label: "2 months back" },
  { id: "previous-month-3", label: "3 months back" },
] as const;

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function statusBadge(s: number): { label: string; tone: "default" | "outline" | "secondary" | "destructive" } {
  switch (s) {
    case 1:
      return { label: "Approved", tone: "default" };
    case 0:
      return { label: "Awaiting", tone: "outline" };
    case -1:
      return { label: "Cancelled", tone: "destructive" };
    case -2:
      return { label: "Reserved", tone: "secondary" };
    case -3:
      return { label: "Unavailable", tone: "secondary" };
    default:
      return { label: `Status ${s}`, tone: "outline" };
  }
}

type PageProps = {
  searchParams: Promise<{ status?: string; period?: string; page?: string }>;
};

export default async function AdminPayoutsPage({ searchParams }: PageProps) {
  const u = await getSessionUser();
  ensureInvestor(u);
  const sp = await searchParams;
  const status = parseAdminPayoutStatus(sp.status);
  const period = parseAdminPayoutPeriod(sp.period);
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total, counts } = await getAdminPayouts(status, period, page);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAYOUTS_PER_PAGE));
  const range = periodRange(period);
  const meta = PAYOUT_STATUS_META[status];
  const canMutate = isAdmin(u);

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Payouts queue"
        description={`Author payout queue. Mirrors Laravel \`Admin\\Payouts\` — period ${format(range.start, "dd MMM yyyy")} – ${format(range.end, "dd MMM yyyy")}.`}
        badge={{ label: `${total} in this view` }}
      />

      <Card className="border-border/60">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="text-sm font-semibold">{meta.title} — {range.label}</CardTitle>
          <div className="flex flex-wrap gap-1">
            {PERIOD_TABS.map((p) => (
              <Button key={p.id} size="sm" variant={period === p.id ? "default" : "outline"} asChild>
                <Link href={`/adminzone/payouts?status=${status}&period=${p.id}`}>{p.label}</Link>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map((s) => (
              <Button key={s} size="sm" variant={status === s ? "default" : "outline"} asChild>
                <Link href={`/adminzone/payouts?status=${s}&period=${period}`}>
                  {PAYOUT_STATUS_META[s].title}
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
                    {counts[s] ?? 0}
                  </span>
                </Link>
              </Button>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
              {meta.description}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[64px]">ID</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Subs</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const badge = statusBadge(row.status);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{row.id}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{row.recipient_name ?? `#${row.recipient_id}`}</span>
                            <span className="text-[11px] text-muted-foreground">{row.recipient_email}</span>
                            {row.withdraw_account ? (
                              <span className="line-clamp-1 text-[11px] text-muted-foreground">
                                {row.withdraw_account}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.method ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{money(row.sold_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {money(row.subs_amount)}
                          {row.subs_bonus ? (
                            <div className="text-[10px] text-emerald-500">+ {money(row.subs_bonus)}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">
                          {money(row.amount)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.created_at ? format(new Date(row.created_at), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.tone} className="text-[10px]">
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canMutate ? (
                            <PayoutRowActions id={row.id} status={row.status} />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">read-only</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <AdminPagination
            page={page}
            totalPages={totalPages}
            hrefFor={(p) => `/adminzone/payouts?status=${status}&period=${period}&page=${p}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
