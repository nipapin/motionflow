import Link from "next/link";
import { Bookmark } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getFavoriteItemIds } from "@/lib/favorites";
import { getMarketItemsByIds } from "@/lib/market-items";
import { FavoritesList } from "@/components/favorites-list";
import { ProfileEmptyState } from "@/components/profile/profile-empty-state";
import { Button } from "@/components/ui/button";

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
            : "Saved templates and audio packs"}
        </p>
      </div>
      {products.length > 0 ? (
        <FavoritesList initialProducts={products} />
      ) : (
        <ProfileEmptyState
          icon={Bookmark}
          title="No favorites yet"
          description="Save items from the catalog to build a shortlist you can return to anytime."
        >
          <Button asChild size="sm">
            <Link href="/">Browse catalog</Link>
          </Button>
        </ProfileEmptyState>
      )}
    </div>
  );
}
