import { notFound, redirect } from "next/navigation";
import SpunkramItemPage from "@/app/(authors)/spunkram/item/[id]/page";
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) notFound();

  const [item] = await getMarketItemsByIds([itemId]);
  if (!item || item.access !== 1) notFound();

  if (item.author_id === SPUNKRAM_AUTHOR_ID) {
    // Render in place so the public URL stays /item/{id}.
    return SpunkramItemPage({ params: Promise.resolve({ id: String(itemId) }) });
  }

  if (item.author_id === PREMIERE_GAL_AUTHOR_ID) {
    redirect("/premiere-gal");
  }

  redirect(motionflowItemPageUrl(item, itemId, item.name));
}
