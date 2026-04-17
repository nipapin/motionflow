import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getDownloadsForUser } from "@/lib/downloads";
import { OwnedItemCard, formatDate } from "@/components/owned-item-card";

export const metadata: Metadata = {
  title: "My downloads",
};

export const dynamic = "force-dynamic";

export default async function ProfileDownloadsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const list = await getDownloadsForUser(user.id);

  if (list.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">My downloads</h1>
        <div className="flex flex-col items-center rounded-2xl border border-blue-500/30 bg-card/40 px-6 py-14 text-center glow">
          <h2 className="mb-2 text-lg font-medium">No downloads yet.</h2>
          <p className="mb-6 text-muted-foreground">
            With an active subscription, downloads appear here. You can also open items you&apos;ve purchased.
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My downloads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {list.length} download{list.length === 1 ? "" : "s"} recorded
        </p>
      </div>
      <ul className="space-y-4">
        {list.map((row) => (
          <li key={row.id}>
            <OwnedItemCard
              product={row.product}
              titleFallback={`Item #${row.itemId}`}
              metaLine={row.purchaseCode ? `Code ${row.purchaseCode.slice(0, 8)}…` : undefined}
              dateLabel={`Downloaded ${formatDate(row.createdAt)}`}
              downloadHref={`/api/download/${row.itemId}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
