import { NextResponse } from "next/server";
import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAuthor } from "@/lib/auth/access-control";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";
import { UPLOAD_CATEGORIES, type UploadCategorySlug } from "@/lib/author/upload-categories";

const slugs = new Set<string>(UPLOAD_CATEGORIES.map((c) => c.slug));

const schema = z.object({
  indexCategorySlug: z.string(),
  name: z.string().min(2).max(100),
  description: z.string().max(20000).optional(),
  extraSlug: z.string().max(80).optional().nullable(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !isAuthor(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  const slug = parsed.data.indexCategorySlug as UploadCategorySlug;
  if (!slugs.has(slug)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  /** Draft / pending: `access = 0` matches Laravel “awaiting approval” pool (exact flags vary by moderation). */
  const access = 0;
  const table = marketplaceItemsTable();
  const pool = getPool();

  try {
    const [res] = await pool.execute<ResultSetHeader>(
      `INSERT INTO \`${table}\`
        (author_id, access, price, team, exclusive, subscription, index_category_slug, sub_category_slug, name, description, tags, has_qty, attributes, files, extra, created_at, updated_at)
       VALUES (?, ?, 0, NULL, 0, 0, ?, '', ?, ?, '', 0, '{}', '{}', ?, NOW(), NOW())`,
      [user.id, access, slug, parsed.data.name, parsed.data.description ?? "", parsed.data.extraSlug ?? null],
    );
    return NextResponse.json({ id: res.insertId, access });
  } catch (e) {
    console.error("[upload/draft]", e);
    return NextResponse.json({ error: "Database rejected insert (schema mismatch?)" }, { status: 500 });
  }
}
