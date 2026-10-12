import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { PdfLinkPageClient } from "@/components/pdf-link-page-client";

export const metadata: Metadata = {
  title: "PDF Links",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AdminPdfLinkPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isAffiliateAdmin(user)) redirect("/profile");

  return (
    <div className="w-full space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">PDF Links</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Upload a PDF to get a permanent link you can share, bookmark, or use as a desktop shortcut.
        </p>
      </header>
      <PdfLinkPageClient />
    </div>
  );
}
