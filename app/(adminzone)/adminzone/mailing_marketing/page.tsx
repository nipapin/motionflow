import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor, isAdmin } from "@/lib/auth/access-control";
import {
  ADMIN_MAILING_PER_PAGE,
  getMailingAdminPage,
} from "@/lib/admin/mailing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { MailingTable } from "@/components/admin/mailing-table";

export const metadata: Metadata = { title: "Mailing — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ page?: string }> };

export default async function AdminMailingPage({ searchParams }: PageProps) {
  const u = await getSessionUser();
  ensureInvestor(u);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await getMailingAdminPage(page);
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_MAILING_PER_PAGE));

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Mailing campaigns"
        description="Author + admin newsletter campaigns (`mailing_marketings`). Mirrors Laravel `Admin\\MailingMarketing`."
        badge={{ label: `${total} campaign${total === 1 ? "" : "s"}` }}
        actions={
          isAdmin(u) ? (
            <Button asChild size="sm">
              <Link href="/adminzone/mailing_marketing/create">
                <Plus className="size-4" />
                New mailing
              </Link>
            </Button>
          ) : null
        }
      />

      <Card className="border-border/60">
        <CardContent className="space-y-4 pt-4">
          <MailingTable rows={rows} />
          <AdminPagination
            page={page}
            totalPages={totalPages}
            hrefFor={(p) => `/adminzone/mailing_marketing?page=${p}`}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="space-y-2 pt-6 text-xs text-muted-foreground">
          <p>
            Email dispatch is not wired into the Next.js app yet — &ldquo;Mark sent&rdquo; only flips the status. Hook this up once an
            email provider (Resend / Postmark / nodemailer) is integrated.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
