import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { PurchaseItemCard } from "@/components/purchase-item-card";
import { motionflowInvoiceUrl, motionflowItemPageUrl } from "@/lib/motionflow-urls";
import { getPurchasesForUser } from "@/lib/purchases";

export const metadata: Metadata = {
  title: "My purchases",
};

export const dynamic = "force-dynamic";

export default async function ProfilePurchasesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const list = await getPurchasesForUser(user.id);

  if (list.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">My purchases</h1>
        <div className="flex flex-col items-center rounded-2xl border border-blue-500/30 bg-card/40 px-6 py-14 text-center glow">
          <h2 className="mb-2 text-lg font-medium">You don&apos;t have any purchases yet.</h2>
          <p className="mb-6 text-muted-foreground">Browse the marketplace and pick a template or asset.</p>
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
        <h1 className="text-2xl font-semibold tracking-tight">My purchases</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {list.length} order{list.length === 1 ? "" : "s"}
        </p>
      </div>
      <ul className="space-y-4">
        {list.map((row) => {
          const titleFallback = `Item #${row.itemId}`;
          return (
            <li key={row.id}>
              <PurchaseItemCard
                product={row.product}
                titleFallback={titleFallback}
                itemId={row.itemId}
                soldItemId={row.id}
                license={row.license}
                purchaseCode={row.purchaseCode}
                itemPageUrl={motionflowItemPageUrl(row.product, row.itemId, titleFallback)}
                downloadUrl={`/api/download/${row.itemId}`}
                invoiceUrl={motionflowInvoiceUrl(row.product, row.itemId, titleFallback, row.id)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
