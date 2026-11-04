import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getMarketItemsByIds } from "@/lib/market-items";
import { motionflowItemPageUrl } from "@/lib/motionflow-urls";
import { PREMIERE_GAL_AUTHOR_ID } from "@/lib/premiere-gal-paddle-config";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

/**
 * Main-site bare item URL: `https://motionflow.pro/item/{id}` (Next.js).
 * Laravel keeps `/item/{slug}/{id}` and author subdomains (e.g. spunkram.motionflow.pro).
 */
export default async function MainSiteItemByIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) notFound();

  const [item] = await getMarketItemsByIds([itemId], await getSessionUser());
  if (!item || item.access !== 1) notFound();

  if (item.author_id === SPUNKRAM_AUTHOR_ID) {
    const url = new URL(`/spunkram/item/${itemId}`, "https://motionflow.pro");
    for (const [key, values] of Object.entries(await searchParams)) {
      for (const value of values === undefined ? [] : [values].flat()) {
        url.searchParams.append(key, value);
      }
    }
    redirect(url.pathname + url.search);
  }

  if (item.author_id === PREMIERE_GAL_AUTHOR_ID) {
    redirect("/premiere-gal");
  }

  redirect(motionflowItemPageUrl(item, itemId, item.name));
}
