import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor, isAdmin } from "@/lib/auth/access-control";
import { CONTROL_ACTIONS, getInvestorOptions } from "@/lib/admin/control";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { ControlActionButton } from "@/components/admin/control-action-button";
import { ControlInvestmentForm } from "@/components/admin/control-investment-form";

export const metadata: Metadata = { title: "Control — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminControlPage() {
  const user = ensureInvestor(await getSessionUser());
  const admin = isAdmin(user);
  const investors = await getInvestorOptions();

  const groups: { id: "items" | "payouts" | "sitemap"; title: string; description: string }[] = [
    { id: "items", title: "Items", description: "Bulk moderation tasks." },
    { id: "payouts", title: "Payouts", description: "Trigger payout pipeline." },
    { id: "sitemap", title: "Sitemap", description: "Sitemap generator (Laravel command)." },
  ];

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Control"
        description="Operational switches mirroring Laravel `Admin\\Control`. Some actions delegate to the Laravel queue / artisan commands for parity."
        badge={{ label: admin ? "Admin" : "Investor" }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map((g) => {
          const items = CONTROL_ACTIONS.filter((a) => a.group === g.id);
          return (
            <Card key={g.id} className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">{g.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{g.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map((a) => {
                  const adminLocked = Boolean(a.adminOnly && !admin);
                  return (
                    <div key={a.id} className="rounded-lg border border-border/50 bg-muted/10 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{a.title}</p>
                          <p className="text-xs text-muted-foreground">{a.description}</p>
                          {a.adminOnly ? (
                            <Badge variant="outline" className="text-[10px]">
                              Admin only
                            </Badge>
                          ) : null}
                        </div>
                        <ControlActionButton
                          id={a.id}
                          destructive={a.destructive}
                          disabled={adminLocked}
                        >
                          Run
                        </ControlActionButton>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {admin ? (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Request investment money</CardTitle>
            <p className="text-xs text-muted-foreground">
              Inserts a `pending` row into `invest_analyses`. The configured investor sees it in their portfolio.
            </p>
          </CardHeader>
          <CardContent>
            <ControlInvestmentForm investors={investors} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
