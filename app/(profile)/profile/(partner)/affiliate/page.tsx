import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getShortLinksForUser } from "@/lib/author/affiliate";
import { motionflowSiteOrigin } from "@/lib/motionflow-urls";
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
import { AffiliateCopyCell } from "@/components/author/affiliate-copy-cell";

export const metadata: Metadata = {
  title: "Affiliate",
};

export const dynamic = "force-dynamic";

export default async function AffiliatePage() {
  const user = await getSessionUser();
  if (!user) return null;
  const rows = await getShortLinksForUser(user.id);
  const origin = motionflowSiteOrigin().replace(/\/$/, "");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Affiliate links</h1>
          <p className="text-muted-foreground">Short links that attribute referral earnings on checkout.</p>
        </div>
        <Button asChild>
          <Link href="/profile/affiliate/create">Create link</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your links</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Short URL</TableHead>
                <TableHead>Redirect</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const shortUrl = `${origin}/l/${r.link}`;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell>
                      <AffiliateCopyCell text={shortUrl} />
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">{r.redirect}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.views}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.salesCount}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/profile/affiliate/edit/${r.id}`}>Edit</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No affiliate links yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
