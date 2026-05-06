import type { Metadata } from "next";
import { format } from "date-fns";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { probeUserSubsPack } from "@/lib/admin/subs-pack-tests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";

export const metadata: Metadata = { title: "Subs users pack tests — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ q?: string }> };

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return format(new Date(s), "dd MMM yyyy HH:mm");
  } catch {
    return s;
  }
}

export default async function AdminSubsPackTestsPage({ searchParams }: PageProps) {
  ensureInvestor(await getSessionUser());
  const sp = await searchParams;
  const q = (sp.q ?? "").toString().trim().slice(0, 200);
  const result = q ? await probeUserSubsPack(q) : null;

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Subs users has pack tests"
        description="Inspect a user&rsquo;s subscription, extra-generation balance and Paddle credit ledger. Mirrors Laravel `AdminZoneController@subs_users_has_pack_tests`."
      />

      <Card className="border-border/60">
        <CardContent className="pt-6">
          <form action="/adminzone/subs_users_has_pack_tests" method="get" className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="q">Email or numeric user id</Label>
              <Input id="q" name="q" defaultValue={q} placeholder="user@example.com or 1234" maxLength={200} />
            </div>
            <Button type="submit">Probe user</Button>
          </form>
        </CardContent>
      </Card>

      {result ? (
        result.ok ? (
          <div className="space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                  {result.user.name}{" "}
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    #{result.user.id}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
                <Stat label="Email" value={result.user.email} />
                <Stat label="Access" value={String(result.user.access)} />
                <Stat label="Balance" value={`$${result.user.balance.toFixed(2)}`} />
                <Stat label="Extra generations" value={String(result.extraGenerationsCount)} />
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Subscriptions (last 10)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {result.subscriptions.length === 0 ? (
                  <p className="text-muted-foreground">No `subscription_systems` rows.</p>
                ) : (
                  <ul className="space-y-2">
                    {result.subscriptions.map((s) => (
                      <li key={s.id} className="rounded-lg border border-border/50 p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">#{s.id}</Badge>
                          <Badge variant={s.status === 1 ? "default" : "secondary"} className="text-[10px]">
                            status {s.status}
                          </Badge>
                          {s.type ? <span className="text-[11px]">{s.type}</span> : null}
                          {s.plan ? <span className="text-[11px] text-muted-foreground">{s.plan}</span> : null}
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            {fmtDate(s.ends_at)}
                          </span>
                        </div>
                        <div className="mt-1 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-3">
                          <span>amount: ${s.amount.toFixed(2)}</span>
                          <span>downloads: {s.count}</span>
                          <span>billing: {s.paddle_billing_period ?? "—"}</span>
                        </div>
                        {s.paddle_subscription_id ? (
                          <div className="mt-1 truncate text-[11px] font-mono text-muted-foreground">
                            {s.paddle_subscription_id}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Generation credits</CardTitle>
              </CardHeader>
              <CardContent className="text-xs">
                {result.generationCredits ? (
                  <div className="grid gap-2 sm:grid-cols-4">
                    <Stat label="Plan limit" value={String(result.generationCredits.plan_limit)} />
                    <Stat label="Extra balance" value={String(result.generationCredits.extra_balance)} />
                    <Stat label="Used" value={String(result.generationCredits.used)} />
                    <Stat label="Cycle" value={result.generationCredits.cycle_ref ?? "—"} />
                  </div>
                ) : (
                  <p className="text-muted-foreground">No `user_generation_credits` row.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Paddle extra-credit events (last 10)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                {result.paddleEvents.length === 0 ? (
                  <p className="text-muted-foreground">No events.</p>
                ) : (
                  <ul className="space-y-1">
                    {result.paddleEvents.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 px-2 py-1">
                        <Badge variant="outline" className="text-[10px]">
                          {e.event}
                        </Badge>
                        <span>qty {e.quantity}</span>
                        <span className="text-muted-foreground">→ {e.balance_after}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{fmtDate(e.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">{result.error}</CardContent>
          </Card>
        )
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
