import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getFavoriteItemIds } from "@/lib/favorites";
import { getMarketItemsByIds } from "@/lib/market-items";
import { FavoritesList } from "@/components/favorites-list";

export const dynamic = "force-dynamic";

export default async function ProfileFavoritesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const ids = await getFavoriteItemIds(user.id);
  const products = await getMarketItemsByIds(ids);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Favorites</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {products.length > 0
            ? `${products.length} saved item${products.length === 1 ? "" : "s"}`
            : "You haven\u2019t saved anything yet."}
        </p>
      </div>
      {products.length > 0 && <FavoritesList initialProducts={products} />}
    </div>
  );
}
