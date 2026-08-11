import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/resolve-request-user";
import { getDownloadsForUser } from "@/lib/downloads";
import { productThumbnailUrl } from "@/lib/product-ui";

/**
 * GET /api/me/downloads
 * Recent marketplace downloads for Account → My Downloads.
 * Cookie session or CEP Bearer (`mfcep_…`).
 */
export async function GET(req: NextRequest) {
  const user = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ authenticated: false, items: [] }, { status: 401 });
  }

  try {
    const { items, queryFailed } = await getDownloadsForUser(user.id);
    if (queryFailed) {
      return NextResponse.json(
        { error: "Failed to load downloads", items: [] },
        { status: 500 },
      );
    }

    return NextResponse.json({
      authenticated: true,
      items: items.map((d) => ({
        id: d.id,
        item_id: d.itemId,
        created_at: d.createdAt,
        name: d.product?.name ?? `Item ${d.itemId}`,
        index_category_slug: d.product?.index_category_slug ?? null,
        thumbnail_url: d.product ? productThumbnailUrl(d.product) || null : null,
        download_url: `/api/download/${d.itemId}`,
      })),
    });
  } catch (err) {
    console.error("[me/downloads GET]", err);
    return NextResponse.json(
      { error: "Failed to load downloads", items: [] },
      { status: 500 },
    );
  }
}
