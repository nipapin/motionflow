import { redirect } from "next/navigation";

/** Typo / legacy plural path → canonical Spunkram item page. */
export default async function SpunkramItemsRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/spunkram/item/${id}`);
}
