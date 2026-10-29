import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withAccountAudit } from "@/lib/account-audit";
import {
  ensureUserGenerationCreditsSchema, ensureCreditsRowForUser,
  fetchCreditsRowLocked, incrementPurchasedExtraBalance,
} from "@/lib/user-generation-credits";

export class AuthorCreditGrantError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

/** Adds to the author's SSOT row, also used by /api/cep/generations. */
export async function addAuthorExtraGenerations(input: {
  userId: number; authorId: number; adminUserId: number;
  amount: number; requestId: string; note?: string;
}): Promise<{ extraBalance: number; added: number; duplicate: boolean }> {
  if (![input.userId, input.authorId, input.adminUserId].every(id => Number.isSafeInteger(id) && id > 0)
    || !Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > 1_000_000
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) {
    throw new AuthorCreditGrantError("INVALID_GRANT", 400);
  }
  // Schema work must complete before the transaction (DDL implicitly commits).
  await ensureUserGenerationCreditsSchema();
  return withAccountAudit({ actorUserId: input.adminUserId, source: "admin.credits" }, async conn => {
    await conn.beginTransaction();
    try {
      const [users] = await conn.execute<RowDataPacket[]>("SELECT id FROM users WHERE id = ? LIMIT 1", [input.userId]);
      if (!users.length) throw new AuthorCreditGrantError("USER_NOT_FOUND", 404);
      await ensureCreditsRowForUser(input.userId, input.authorId, conn);
      const row = await fetchCreditsRowLocked(input.userId, input.authorId, conn);
      if (!row) throw new Error("CREDITS_ROW_MISSING");
      const before = Number(row.extra_balance);
      // The credits-row lock serializes grants, retries and concurrent CEP debits.
      const [previous] = await conn.execute<RowDataPacket[]>(
        `SELECT payload FROM user_generation_credit_audit
         WHERE user_id = ? AND author_id = ? AND action = 'admin_add_extra'
           AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.requestId')) = ? LIMIT 1`,
        [input.userId, input.authorId, input.requestId],
      );
      if (previous[0]) {
        const payload = typeof previous[0].payload === "string" ? JSON.parse(previous[0].payload) : previous[0].payload;
        if (Number(payload.amount) !== input.amount || Number(payload.adminUserId) !== input.adminUserId) throw new AuthorCreditGrantError("REQUEST_CONFLICT", 409);
        await conn.commit();
        return { extraBalance: before, added: 0, duplicate: true };
      }
      const after = before + input.amount;
      if (!Number.isSafeInteger(after) || after > 2_147_483_647) throw new AuthorCreditGrantError("BALANCE_LIMIT", 400);
      await incrementPurchasedExtraBalance(input.userId, input.amount, conn, input.authorId);
      await conn.execute(
        `INSERT INTO user_generation_credit_audit (user_id, author_id, action, payload, note)
         VALUES (?, ?, 'admin_add_extra', ?, ?)`,
        [input.userId, input.authorId, JSON.stringify({ requestId: input.requestId, adminUserId: input.adminUserId, amount: input.amount, before, after }), input.note?.trim() || null],
      );
      await conn.commit();
      return { extraBalance: after, added: input.amount, duplicate: false };
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
}
