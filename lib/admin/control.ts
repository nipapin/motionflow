import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";

export type ControlActionId =
  | "massApprove"
  | "deleteUselessItems"
  | "payoutInit"
  | "payoutStart"
  | "payoutCancel"
  | "genSitemap";

export type ControlActionMeta = {
  id: ControlActionId;
  group: "items" | "payouts" | "sitemap";
  title: string;
  description: string;
  destructive?: boolean;
  adminOnly?: boolean;
};

export const CONTROL_ACTIONS: ControlActionMeta[] = [
  {
    id: "massApprove",
    group: "items",
    title: "Mass approve pending items",
    description: "Sets `access = 1` for every marketplace item currently in `access = 0`. Use only when you have manually triaged the queue.",
    destructive: true,
  },
  {
    id: "deleteUselessItems",
    group: "items",
    title: "Delete blocked items",
    description: "Reserved for the Laravel command pipeline (`marketplaceItem:cleanBlocked`). Disabled in this UI; run from the worker shell.",
    destructive: true,
  },
  {
    id: "payoutInit",
    group: "payouts",
    title: "Initialise awaiting payouts",
    description: "Equivalent to `php artisan mkpayout:init` — generates payout rows for the upcoming pay run.",
    adminOnly: true,
  },
  {
    id: "payoutStart",
    group: "payouts",
    title: "Start (pay all approved)",
    description: "Equivalent to `php artisan mkpayout:start` — disabled here; trigger from the worker until parity is implemented.",
    adminOnly: true,
    destructive: true,
  },
  {
    id: "payoutCancel",
    group: "payouts",
    title: "Cancel pending payouts",
    description: "Marks every awaiting payout as cancelled (status -1). Use when restarting a pay run.",
    adminOnly: true,
    destructive: true,
  },
  {
    id: "genSitemap",
    group: "sitemap",
    title: "Re-create sitemap.xml",
    description: "Sitemap generation is not implemented in Next.js yet. Use the Laravel command for now.",
  },
];

export type ControlActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function runControlAction(
  id: ControlActionId,
  options: { isAdmin: boolean },
): Promise<ControlActionResult> {
  const pool = getPool();

  switch (id) {
    case "massApprove": {
      const table = marketplaceItemsTable();
      const [res] = await pool.execute<ResultSetHeader>(
        `UPDATE \`${table}\` SET access = 1 WHERE access = 0`,
      );
      const affected = (res as ResultSetHeader).affectedRows ?? 0;
      return { ok: true, message: `Approved ${affected} item${affected === 1 ? "" : "s"}.` };
    }
    case "deleteUselessItems":
      return {
        ok: false,
        error: "Disabled in this UI. Run the Laravel command `marketplaceItem:cleanBlocked` from the worker.",
      };
    case "payoutInit": {
      if (!options.isAdmin) return { ok: false, error: "Only admin can trigger payouts." };
      // Insert one payout row per author with positive balance ≥ withdraw_min (parity-light).
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [authors] = await conn.execute<RowDataPacket[]>(
          `SELECT id, balance, COALESCE(withdraw_min_amount, 50) AS min, withdraw_method
             FROM users
             WHERE access >= 1 AND balance > 0`,
        );
        let inserted = 0;
        for (const a of authors) {
          const balance = Number(a.balance ?? 0);
          const min = Number(a.min ?? 50);
          const method = a.withdraw_method == null ? null : String(a.withdraw_method);
          if (balance < min) continue;
          if (!method) continue;
          await conn.execute(
            `INSERT INTO payouts (recipient_id, status, amount, sold_amount, subs_amount, method, created_at, updated_at)
             VALUES (?, 0, ?, 0, 0, ?, NOW(), NOW())`,
            [Number(a.id), balance, method],
          );
          inserted += 1;
        }
        await conn.commit();
        return { ok: true, message: `Created ${inserted} awaiting payout${inserted === 1 ? "" : "s"}.` };
      } catch (e) {
        await conn.rollback();
        const msg = e instanceof Error ? e.message : "Failed";
        return { ok: false, error: msg };
      } finally {
        conn.release();
      }
    }
    case "payoutStart":
      if (!options.isAdmin) return { ok: false, error: "Only admin can trigger payouts." };
      return {
        ok: false,
        error:
          "Disabled in this UI — run `php artisan mkpayout:start` so the Laravel pipeline can talk to PayPal/Payoneer.",
      };
    case "payoutCancel": {
      if (!options.isAdmin) return { ok: false, error: "Only admin can cancel payouts." };
      const [res] = await pool.execute<ResultSetHeader>(
        `UPDATE payouts SET status = -1, updated_at = NOW() WHERE status = 0`,
      );
      const affected = (res as ResultSetHeader).affectedRows ?? 0;
      return { ok: true, message: `Cancelled ${affected} awaiting payout${affected === 1 ? "" : "s"}.` };
    }
    case "genSitemap":
      return {
        ok: false,
        error:
          "Sitemap generator not ported to Next.js yet (see migration P3 §35). Run `php artisan` from Laravel for now.",
      };
    default:
      return { ok: false, error: "Unknown action" };
  }
}

export type InvestorOption = {
  user_id: number;
  name: string;
  remaining: number;
};

export async function getInvestorOptions(): Promise<InvestorOption[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ia.user_id, u.name, ia.amount,
            COALESCE((SELECT SUM(amount) FROM invest_analyses WHERE user_id = ia.user_id AND status IN ('completed', 'pending')), 0) AS used
       FROM invest_analyses ia
       INNER JOIN users u ON u.id = ia.user_id
       WHERE ia.status = 'setup'`,
  );
  return rows.map((r) => {
    const amount = Number(r.amount ?? 0);
    const used = Number(r.used ?? 0);
    return {
      user_id: Number(r.user_id),
      name: String(r.name ?? ""),
      remaining: Math.max(0, amount - used),
    };
  });
}

export async function requestInvestmentMoney(input: {
  investorUserId: number;
  amount: number;
  description: string;
  staffId: number;
}): Promise<ControlActionResult> {
  if (!Number.isFinite(input.investorUserId) || input.investorUserId <= 0)
    return { ok: false, error: "Investor required" };
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    return { ok: false, error: "Amount must be positive" };

  const pool = getPool();
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO invest_analyses (user_id, status, amount, content, staff_id, created_at, updated_at)
     VALUES (?, 'pending', ?, ?, ?, NOW(), NOW())`,
    [input.investorUserId, input.amount, input.description ?? "", input.staffId],
  );
  const id = (res as ResultSetHeader).insertId ?? 0;
  return { ok: true, message: `Created request #${id} for $${input.amount}.` };
}
