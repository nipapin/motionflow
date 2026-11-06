import "server-only";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { getCepClientByAuthorId } from "@/lib/cep-client-registry";
import { buildExtensionUsersQuery } from "@/lib/extension-users-query";
import { ensurePackagesProjectsTable } from "@/lib/packages-authors-db";
import { ensureSchema as ensureErrorsSchema } from "@/lib/cep-error-reports";
import { parseExtensionUserFilters, validateUserDateRanges } from "@/lib/user-list-filters";
import { parseTableView } from "@/lib/table-query";
import { soldItemAccessCondition } from "@/lib/campaigns/core.mjs";
import { addAuthorExtraGenerations, AuthorCreditGrantError } from "@/lib/admin-author-generation-credits";

type Batch = {
  id: string; authorId: number; adminUserId: number; amount: number; note: string;
  userIds: number[]; completed: number; added: number; duplicates: number;
};
const key = (id: string) => `mf:author-credit-batch:${id}`;
const publicBatch = (batch: Batch) => ({ id: batch.id, amount: batch.amount, note: batch.note,
  total: batch.userIds.length, completed: batch.completed, added: batch.added,
  duplicates: batch.duplicates, done: batch.completed === batch.userIds.length });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function previewAuthorCreditBatch(input: {
  authorId: number; adminUserId: number; amount: number; note: string;
  query: string; packIds: number[];
}) {
  if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > 1_000_000
    || input.note.length > 500 || input.query.length > 16000 || input.packIds.length > 100
    || !input.packIds.every(id => Number.isSafeInteger(id) && id > 0)) {
    throw new AuthorCreditGrantError("INVALID_GRANT", 400);
  }
  const params = new URLSearchParams(input.query);
  const dateError = validateUserDateRanges(params);
  if (dateError) throw new AuthorCreditGrantError("INVALID_FILTERS", 400);
  const tableView = parseTableView(params.get("tableView"));
  await ensurePackagesProjectsTable();
  if (tableView.filters.errors || tableView.sort?.columnId === "errors") await ensureErrorsSchema();
  const query = buildExtensionUsersQuery({ authorId: input.authorId,
    client: getCepClientByAuthorId(input.authorId)?.client ?? null,
    q: params.get("q") ?? undefined, filters: parseExtensionUserFilters(params), tableView });
  const packIds = [...new Set(input.packIds)].sort((a, b) => a - b);
  if (packIds.length) {
    const [packs] = await getPool().execute<RowDataPacket[]>(
      `SELECT id FROM packages_projects WHERE author_id = ? AND id IN (${packIds.map(() => "?").join(",")})
       AND deleted_at IS NULL AND COALESCE(admin_only, 0) = 0 AND price > 0`, [input.authorId, ...packIds]);
    if (packs.length !== packIds.length) throw new AuthorCreditGrantError("INVALID_PACKS", 400);
  }
  const purchaseSql = packIds.length ? ` AND EXISTS (
    SELECT 1 FROM sold_items si JOIN packages_projects pp
      ON pp.author_id = si.author_id AND (si.item_id = pp.id OR si.item_id = pp.marketplace_item_id)
    WHERE si.buyer_id = u.id AND si.author_id = ? AND pp.id IN (${packIds.map(() => "?").join(",")})
      AND ${soldItemAccessCondition("si")})` : "";
  // The same list filters are applied before pagination; a user is selected only once.
  const [users] = await getPool().execute<RowDataPacket[]>(
    `SELECT DISTINCT u.id ${query.fromSql}${purchaseSql} ORDER BY u.id LIMIT 10001`,
    [...query.params, ...(packIds.length ? [input.authorId, ...packIds] : [])]);
  if (users.length > 10000) throw new AuthorCreditGrantError("BATCH_TOO_LARGE", 400);
  const batch: Batch = { id: randomUUID(), authorId: input.authorId, adminUserId: input.adminUserId,
    amount: input.amount, note: input.note.trim(), userIds: users.map(user => Number(user.id)),
    completed: 0, added: 0, duplicates: 0 };
  await getRedis().set(key(batch.id), JSON.stringify(batch), "EX", 3600);
  return publicBatch(batch);
}

/** Each user's balance and audit commit together; retries reuse the same request ID. */
export async function applyAuthorCreditBatch(authorId: number, adminUserId: number, id: string) {
  if (!uuid.test(id)) throw new AuthorCreditGrantError("INVALID_GRANT", 400);
  const redis = getRedis(), batchKey = key(id), lockKey = `${batchKey}:lock`, owner = randomUUID();
  if (!await redis.set(lockKey, owner, "EX", 120, "NX")) throw new AuthorCreditGrantError("BATCH_BUSY", 409);
  try {
    const raw = await redis.get(batchKey);
    if (!raw) throw new AuthorCreditGrantError("BATCH_EXPIRED", 410);
    const batch = JSON.parse(raw) as Batch;
    if (batch.authorId !== authorId || batch.adminUserId !== adminUserId) throw new AuthorCreditGrantError("FORBIDDEN", 403);
    await redis.expire(batchKey, 7 * 86400);
    const end = Math.min(batch.completed + 25, batch.userIds.length);
    // Persist a checkpoint after each bounded request. A lost checkpoint can be replayed safely.
    for (let index = batch.completed; index < end; index++) {
      const result = await addAuthorExtraGenerations({ userId: batch.userIds[index], authorId,
        adminUserId, amount: batch.amount, note: batch.note, requestId: batch.id });
      batch.completed++;
      if (result.duplicate) batch.duplicates++;
      else batch.added++;
    }
    await redis.set(batchKey, JSON.stringify(batch), "EX", 7 * 86400);
    return publicBatch(batch);
  } finally {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, lockKey, owner);
  }
}
