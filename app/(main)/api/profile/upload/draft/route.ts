import { NextResponse } from "next/server";
import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAuthor } from "@/lib/auth/access-control";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";
import { UPLOAD_CATEGORIES, type UploadCategorySlug } from "@/lib/author/upload-categories";
import { normalizeSubCategoriesForIndex } from "@/lib/author/upload-subcategories";

const slugs = new Set<string>(UPLOAD_CATEGORIES.map((c) => c.slug));

const schema = z.object({
  indexCategorySlug: z.string(),
  name: z.string().min(2).max(100),
  description: z.string().max(20000).optional(),
  extraSlug: z.string().max(80).optional().nullable(),
  tags: z.string().max(4000).optional(),
  subCategorySlugs: z.array(z.string().max(80)).max(3).optional(),
  price: z.coerce.number().min(0).max(500).optional().default(0),
  exclusive: z.boolean().optional().default(false),
  subscription: z.boolean().optional().default(false),
  attributes: z
    .object({
      works_with: z.string().max(80).optional(),
      os_compatibles: z.string().max(120).optional(),
      file_size: z.string().max(40).optional(),
    })
    .optional(),
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
  const subStr = normalizeSubCategoriesForIndex(slug, parsed.data.subCategorySlugs);
  const tags = (parsed.data.tags ?? "").slice(0, 4000);
  const price = parsed.data.price ?? 0;
  const exclusive = parsed.data.exclusive ? 1 : 0;
  const subscription = parsed.data.subscription ? 1 : 0;
  const worksWith = (parsed.data.attributes?.works_with?.trim() || slug).slice(0, 80);
  const osCompat = (parsed.data.attributes?.os_compatibles?.trim() || "Windows & Mac OS").slice(0, 120);
  const fileSize = parsed.data.attributes?.file_size?.trim();
  const attributes = {
    works_with: worksWith,
    os_compatibles: osCompat,
    ...(fileSize ? { file_size: fileSize.slice(0, 40) } : {}),
  };

  try {
    const [res] = await pool.execute<ResultSetHeader>(
      `INSERT INTO \`${table}\`
        (author_id, access, price, team, exclusive, subscription, index_category_slug, sub_category_slug, name, description, tags, has_qty, attributes, files, extra, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, ?, '{}', ?, NOW(), NOW())`,
      [
        user.id,
        access,
        price,
        exclusive,
        subscription,
        slug,
        subStr,
        parsed.data.name,
        parsed.data.description ?? "",
        tags,
        JSON.stringify(attributes),
        parsed.data.extraSlug ?? null,
      ],
    );
    return NextResponse.json({ id: res.insertId, access, attributes });
  } catch (e) {
    console.error("[upload/draft]", e);
    return NextResponse.json({ error: "Database rejected insert (schema mismatch?)" }, { status: 500 });
  }
}
