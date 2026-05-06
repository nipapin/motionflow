import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";

/**
 * Mirrors Laravel `PaddleCustomCheckoutController::resolveCheckoutDiscountForUser`.
 * Snapshots the user's current Paddle subscription state + extra-generation balance so admins
 * can verify which discount/pack-tier the checkout would resolve to.
 */
export type SubsPackProbeResult =
  | { ok: false; error: string }
  | {
      ok: true;
      user: { id: number; name: string; email: string; access: number; balance: number };
      subscriptions: Array<{
        id: number;
        type: string | null;
        plan: string | null;
        status: number;
        amount: number;
        count: number;
        ends_at: string | null;
        paddle_subscription_id: string | null;
        paddle_billing_period: string | null;
      }>;
      extraGenerationsCount: number;
      generationCredits: { plan_limit: number; extra_balance: number; used: number; cycle_ref: string | null } | null;
      paddleEvents: Array<{ id: number; event: string; quantity: number; balance_after: number; created_at: string }>;
    };

export async function probeUserSubsPack(query: string): Promise<SubsPackProbeResult> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: false, error: "Provide an email or numeric user id" };

  const pool = getPool();

  let user: RowDataPacket | undefined;
  if (/^\d+$/.test(trimmed)) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, name, email, access, balance, extra_generations_count
         FROM users WHERE id = ? LIMIT 1`,
      [Number(trimmed)],
    );
    user = rows[0];
  } else {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, name, email, access, balance, extra_generations_count
         FROM users WHERE email = ? LIMIT 1`,
      [trimmed.toLowerCase()],
    );
    user = rows[0];
  }
  if (!user) return { ok: false, error: "User not found" };

  const [
    subsRows,
    creditsRows,
    eventsRows,
  ] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT id, type, plan, status, amount, \`count\`, ends_at,
              paddle_subscription_id, paddle_billing_period
         FROM subscription_systems
         WHERE buyer_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
      [Number(user.id)],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT plan_limit, extra_balance, used, cycle_ref
         FROM user_generation_credits
         WHERE user_id = ?
         LIMIT 1`,
      [Number(user.id)],
    ).catch(() => [[], []] as [RowDataPacket[], unknown]),
    pool.execute<RowDataPacket[]>(
      `SELECT id, event, quantity, balance_after, created_at
         FROM paddle_extra_generation_credit_events
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
      [Number(user.id)],
    ).catch(() => [[], []] as [RowDataPacket[], unknown]),
  ]);

  const subscriptions = subsRows[0].map((r) => ({
    id: Number(r.id),
    type: r.type == null ? null : String(r.type),
    plan: r.plan == null ? null : String(r.plan),
    status: Number(r.status ?? 0),
    amount: Number(r.amount ?? 0),
    count: Number(r.count ?? 0),
    ends_at: r.ends_at == null ? null : String(r.ends_at),
    paddle_subscription_id: r.paddle_subscription_id == null ? null : String(r.paddle_subscription_id),
    paddle_billing_period: r.paddle_billing_period == null ? null : String(r.paddle_billing_period),
  }));

  const c = creditsRows[0][0];
  const credits = c
    ? {
        plan_limit: Number(c.plan_limit ?? 0),
        extra_balance: Number(c.extra_balance ?? 0),
        used: Number(c.used ?? 0),
        cycle_ref: c.cycle_ref == null ? null : String(c.cycle_ref),
      }
    : null;

  const events = eventsRows[0].map((r) => ({
    id: Number(r.id),
    event: String(r.event ?? ""),
    quantity: Number(r.quantity ?? 0),
    balance_after: Number(r.balance_after ?? 0),
    created_at: r.created_at ? String(r.created_at) : "",
  }));

  return {
    ok: true,
    user: {
      id: Number(user.id),
      name: String(user.name ?? ""),
      email: String(user.email ?? ""),
      access: Number(user.access ?? 0),
      balance: Number(user.balance ?? 0),
    },
    subscriptions,
    extraGenerationsCount: Number(user.extra_generations_count ?? 0),
    generationCredits: credits,
    paddleEvents: events,
  };
}
