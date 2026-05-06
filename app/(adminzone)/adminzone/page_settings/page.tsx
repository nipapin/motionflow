import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor, isAdmin } from "@/lib/auth/access-control";
import { getPageSettings } from "@/lib/admin/page-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { PageSettingRowActions } from "@/components/admin/page-setting-row-actions";

export const metadata: Metadata = { title: "Page settings — Admin" };
export const dynamic = "force-dynamic";

function formatLabel(isJson: number | null): string {
  if (isJson === 1) return "json";
  if (isJson === 2) return "key=value";
  return "text";
}

export default async function AdminPageSettingsPage() {
  const u = await getSessionUser();
  ensureInvestor(u);
  const canMutate = isAdmin(u);
  const rows = await getPageSettings();

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Page settings"
        description="Dynamic JSON / text snippets used by public pages (`page_settings`). Mirrors Laravel `Admin\\PageSettings`."
        badge={{ label: `${rows.length} setting${rows.length === 1 ? "" : "s"}` }}
        actions={
          canMutate ? (
            <Button asChild size="sm">
              <Link href="/adminzone/page_settings/create">
                <Plus className="size-4" />
                New setting
              </Link>
            </Button>
          ) : null
        }
      />

      <Card className="border-border/60">
        <CardContent className="pt-4">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
              No page settings yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[64px]">ID</TableHead>
                    <TableHead className="w-[140px]">Page</TableHead>
                    <TableHead className="w-[160px]">Key</TableHead>
                    <TableHead className="w-[100px]">Format</TableHead>
                    <TableHead>Preview</TableHead>
                    <TableHead className="w-[110px]">Created</TableHead>
                    <TableHead className="w-[160px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="font-medium">{r.page}</TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">{r.key}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {formatLabel(r.is_json)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.preview}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.created_date}</TableCell>
                      <TableCell className="text-right">
                        <PageSettingRowActions id={r.id} canMutate={canMutate} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
