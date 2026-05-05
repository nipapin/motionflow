import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ExtraGenerationsPurchaseCard } from "@/components/extra-generations-purchase-card";
import { PurchaseItemCard } from "@/components/purchase-item-card";
import { motionflowInvoiceUrl, motionflowItemPageUrl } from "@/lib/motionflow-urls";
import {
  getProfileExtraGenerationPurchases,
  getPurchasesForUser,
  type ExtraGenerationCreditPurchase,
  type PurchaseWithProduct,
} from "@/lib/purchases";

type ProfilePurchaseEntry =
  | { kind: "market"; row: PurchaseWithProduct }
  | { kind: "extra"; row: ExtraGenerationCreditPurchase };

function mergeProfilePurchases(
  market: PurchaseWithProduct[],
  extras: ExtraGenerationCreditPurchase[],
): ProfilePurchaseEntry[] {
  const out: ProfilePurchaseEntry[] = [
    ...market.map((row) => ({ kind: "market" as const, row })),
    ...extras.map((row) => ({ kind: "extra" as const, row })),
  ];
  out.sort((a, b) => {
    const ta = new Date(a.kind === "market" ? (a.row.createdAt ?? 0) : (a.row.createdAt ?? 0)).getTime();
    const tb = new Date(b.kind === "market" ? (b.row.createdAt ?? 0) : (b.row.createdAt ?? 0)).getTime();
    return tb - ta;
  });
  return out;
}

export const metadata: Metadata = {
  title: "My purchases",
};

export const dynamic = "force-dynamic";

export default async function ProfilePurchasesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const [market, extras] = await Promise.all([
    getPurchasesForUser(user.id),
    getProfileExtraGenerationPurchases(user.id),
  ]);
  const list = mergeProfilePurchases(market, extras);

  if (list.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">My purchases</h1>
        <div className="flex flex-col items-center rounded-2xl border border-blue-500/30 bg-card/40 px-6 py-14 text-center glow">
          <h2 className="mb-2 text-lg font-medium">You don&apos;t have any purchases yet.</h2>
          <p className="mb-6 text-muted-foreground">
            Marketplace orders and extra AI generation packs show up here once you buy them.
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
        <h1 className="text-2xl font-semibold tracking-tight">My purchases</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {list.length} order{list.length === 1 ? "" : "s"}
        </p>
      </div>
      <ul className="space-y-4">
        {list.map((entry) => {
          if (entry.kind === "market") {
            const row = entry.row;
            const titleFallback = `Item #${row.itemId}`;
            return (
              <li key={`m-${row.id}`}>
                <PurchaseItemCard
                  product={row.product}
                  titleFallback={titleFallback}
                  itemId={row.itemId}
                  soldItemId={row.id}
                  license={row.license}
                  purchaseCode={row.purchaseCode}
                  itemPageUrl={motionflowItemPageUrl(row.product, row.itemId, titleFallback)}
                  invoiceUrl={motionflowInvoiceUrl(row.product, row.itemId, titleFallback, row.id)}
                />
              </li>
            );
          }
          return (
            <li key={`e-${entry.row.paddleTransactionId}`}>
              <ExtraGenerationsPurchaseCard
                generations={entry.row.generations}
                createdAt={entry.row.createdAt}
                paddleTransactionId={entry.row.paddleTransactionId}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
