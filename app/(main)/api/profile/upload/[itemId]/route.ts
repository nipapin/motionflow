import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAuthor } from "@/lib/auth/access-control";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";
import type { SqlParams } from "@/lib/author/sql-params";
import { normalizeProductFiles } from "@/lib/product-ui";
import type { ProductFiles } from "@/lib/product-types";
import { normalizeSubCategoriesForIndex } from "@/lib/author/upload-subcategories";

type ItemAttributes = {
  works_with?: string;
  os_compatibles?: string;
  file_size?: string;
};

function normalizeAttributes(raw: unknown): ItemAttributes {
  if (!raw) return {};
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return {};
  const r = obj as Record<string, unknown>;
  return {
    works_with: typeof r.works_with === "string" ? r.works_with : undefined,
    os_compatibles: typeof r.os_compatibles === "string" ? r.os_compatibles : undefined,
    file_size: typeof r.file_size === "string" ? r.file_size : undefined,
  };
}

const fileSlug = z
  .string()
  .min(1)
  .max(220)
  .regex(/^[a-zA-Z0-9._-]+$/);

const patchSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    description: z.string().max(20000).optional(),
    extraSlug: z.union([z.string().max(80), z.null()]).optional(),
    files: z
      .object({
        image: fileSlug.optional(),
        video: fileSlug.optional(),
        main: fileSlug.optional(),
      })
      .optional(),
    tags: z.string().max(4000).optional(),
    subCategorySlugs: z.array(z.string().max(80)).max(3).optional(),
    price: z.coerce.number().min(0).max(500).optional(),
    exclusive: z.boolean().optional(),
    subscription: z.boolean().optional(),
    attributes: z
      .object({
        works_with: z.string().max(80).optional(),
        os_compatibles: z.string().max(120).optional(),
        file_size: z.string().max(40).optional(),
      })
      .optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: "No changes" });

type RouteCtx = { params: Promise<{ itemId: string }> };

export async function GET(_req: Request, ctx: RouteCtx) {
  const user = await getSessionUser();
  if (!user || !isAuthor(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId: rawId } = await ctx.params;
  const itemId = Number(rawId);
  if (!Number.isFinite(itemId) || itemId < 1) {
    return NextResponse.json({ error: "Invalid item" }, { status: 400 });
  }

  const table = marketplaceItemsTable();
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, name, description, extra, tags, sub_category_slug, price, exclusive, subscription, files, attributes, index_category_slug
     FROM \`${table}\` WHERE id = ? AND author_id = ? LIMIT 1`,
    [itemId, user.id],
  );
  if (!rows.length) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const row = rows[0]!;
  const subRaw = String(row.sub_category_slug ?? "").trim();
  const subCategorySlugs = subRaw
    ? subRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return NextResponse.json({
    id: Number(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    extraSlug: row.extra == null || row.extra === "" ? null : String(row.extra),
    tags: String(row.tags ?? ""),
    subCategorySlugs,
    price: Number(row.price ?? 0),
    exclusive: Number(row.exclusive ?? 0) === 1,
    subscription: Number(row.subscription ?? 0) === 1,
    files: normalizeProductFiles(row.files as ProductFiles | string | null),
    attributes: normalizeAttributes(row.attributes),
    index_category_slug: String(row.index_category_slug ?? ""),
  });
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const user = await getSessionUser();
  if (!user || !isAuthor(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId: rawId } = await ctx.params;
  const itemId = Number(rawId);
  if (!Number.isFinite(itemId) || itemId < 1) {
    return NextResponse.json({ error: "Invalid item" }, { status: 400 });
  }

  const table = marketplaceItemsTable();
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, access FROM \`${table}\` WHERE id = ? AND author_id = ? LIMIT 1`,
    [itemId, user.id],
  );
  if (!rows.length) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const access = Number(rows[0]!.access ?? 0);
  if (access === 1) {
    return NextResponse.json(
      { error: "Published items cannot be deleted from the dashboard." },
      { status: 409 },
    );
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `DELETE FROM \`${table}\` WHERE id = ? AND author_id = ?`,
    [itemId, user.id],
  );
  if (!result.affectedRows) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: itemId });
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const user = await getSessionUser();
  if (!user || !isAuthor(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId: rawId } = await ctx.params;
  const itemId = Number(rawId);
  if (!Number.isFinite(itemId) || itemId < 1) {
    return NextResponse.json({ error: "Invalid item" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const table = marketplaceItemsTable();
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, author_id, files, index_category_slug, tags, sub_category_slug, price, exclusive, subscription, attributes
     FROM \`${table}\` WHERE id = ? AND author_id = ? LIMIT 1`,
    [itemId, user.id],
  );
  if (!rows.length) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const row = rows[0]!;
  const sets: string[] = [];
  const vals: SqlParams = [];

  if (parsed.data.name !== undefined) {
    sets.push("name = ?");
    vals.push(parsed.data.name);
  }
  if (parsed.data.description !== undefined) {
    sets.push("description = ?");
    vals.push(parsed.data.description);
  }
  if (parsed.data.extraSlug !== undefined) {
    sets.push("extra = ?");
    vals.push(parsed.data.extraSlug);
  }

  let mergedFiles: ProductFiles | undefined;
  if (parsed.data.files !== undefined) {
    const prev = normalizeProductFiles(row.files as ProductFiles | string | null);
    mergedFiles = { ...prev };
    const incoming = parsed.data.files;
    if (incoming.image !== undefined) mergedFiles.image = incoming.image;
    if (incoming.video !== undefined) mergedFiles.video = incoming.video;
    if (incoming.main !== undefined) mergedFiles.main = incoming.main;
    sets.push("files = ?");
    vals.push(JSON.stringify(mergedFiles));
  }

  if (parsed.data.tags !== undefined) {
    sets.push("tags = ?");
    vals.push(parsed.data.tags);
  }

  if (parsed.data.subCategorySlugs !== undefined) {
    const idx = String(row.index_category_slug ?? "");
    const subStr = normalizeSubCategoriesForIndex(idx, parsed.data.subCategorySlugs);
    sets.push("sub_category_slug = ?");
    vals.push(subStr);
  }

  if (parsed.data.price !== undefined) {
    sets.push("price = ?");
    vals.push(parsed.data.price);
  }

  if (parsed.data.exclusive !== undefined) {
    sets.push("exclusive = ?");
    vals.push(parsed.data.exclusive ? 1 : 0);
  }

  if (parsed.data.subscription !== undefined) {
    sets.push("subscription = ?");
    vals.push(parsed.data.subscription ? 1 : 0);
  }

  let mergedAttributes: ItemAttributes | undefined;
  if (parsed.data.attributes !== undefined) {
    const prev = normalizeAttributes(row.attributes);
    mergedAttributes = { ...prev };
    const incoming = parsed.data.attributes;
    if (incoming.works_with !== undefined) mergedAttributes.works_with = incoming.works_with;
    if (incoming.os_compatibles !== undefined) mergedAttributes.os_compatibles = incoming.os_compatibles;
    if (incoming.file_size !== undefined) mergedAttributes.file_size = incoming.file_size;
    sets.push("attributes = ?");
    vals.push(JSON.stringify(mergedAttributes));
  }

  if (!sets.length) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  vals.push(itemId, user.id);
  await pool.execute(
    `UPDATE \`${table}\` SET ${sets.join(", ")}, updated_at = NOW() WHERE id = ? AND author_id = ?`,
    vals,
  );

  const [outRows] = await pool.execute<RowDataPacket[]>(
    `SELECT files, tags, sub_category_slug, price, exclusive, subscription, attributes
     FROM \`${table}\` WHERE id = ? AND author_id = ? LIMIT 1`,
    [itemId, user.id],
  );
  const out = outRows[0]!;

  return NextResponse.json({
    ok: true,
    id: itemId,
    files: normalizeProductFiles(out.files as ProductFiles | string | null),
    attributes: normalizeAttributes(out.attributes),
    tags: String(out.tags ?? ""),
    sub_category_slug: String(out.sub_category_slug ?? ""),
    price: Number(out.price ?? 0),
    exclusive: Number(out.exclusive ?? 0),
    subscription: Number(out.subscription ?? 0),
  });
}
