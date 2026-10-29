/** Only the uploading author and administrators can access a private project. */
export type MarketplaceViewer = { id: number | string; access?: number | string };
export function canViewMarketplaceItem(
  item: { admin_only?: unknown; author_id?: unknown }, viewer?: MarketplaceViewer | null,
): boolean {
  if (item.admin_only !== true && Number(item.admin_only) !== 1) return true;
  return !!viewer && (Number(viewer.access) === 100 ||
    (Number(viewer.id) > 0 && Number(viewer.id) === Number(item.author_id)));
}
