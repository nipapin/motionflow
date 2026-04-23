import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { DownloadsList } from "@/components/downloads-list";
import { getDownloadsForUser } from "@/lib/downloads";

export const metadata: Metadata = {
  title: "My downloads",
};

export const dynamic = "force-dynamic";

export default async function ProfileDownloadsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const { items: list, queryFailed } = await getDownloadsForUser(user.id);

  if (queryFailed) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">My downloads</h1>
        <div className="rounded-2xl border border-destructive/30 bg-card/40 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Downloads could not be loaded. Check that the database table{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">subscription_downloads</code>{" "}
            exists and that MySQL env vars match your Laravel app. Server logs include the underlying error.
          </p>
        </div>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">My downloads</h1>
        <div className="flex flex-col items-center rounded-2xl border border-blue-500/30 bg-card/40 px-6 py-14 text-center glow">
          <h2 className="mb-2 text-lg font-medium">No downloads yet.</h2>
          <p className="mb-6 text-muted-foreground">
            Subscription downloads are listed here after you download an item while your subscription is active.
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-xl bg-linear-to-r from-blue-600 to-blue-500 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/25 smooth hover:from-blue-500 hover:to-blue-400"
          >
            Browse catalog
          </Link>
        </div>
      </div>
    );
  }

  const clientItems = list.map((row) => {
    const titleFallback = `Item #${row.itemId}`;
    return {
      id: row.id,
      itemId: row.itemId,
      product: row.product,
      titleFallback,
      createdAt: row.createdAt,
      downloadUrl: `/api/download/${row.itemId}`,
    };
  });

  return <DownloadsList items={clientItems} />;
}
