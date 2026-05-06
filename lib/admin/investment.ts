import "server-only";
import type { RowDataPacket } from "mysql2";
import type { SqlParams } from "@/lib/author/sql-params";
import { getPool } from "@/lib/db";

export type InvestorSetupRow = {
  user_id: number;
  name: string;
  amount: number;
  percent: number;
};

export type InvestmentChartPack = {
  investors: { labels: string[]; data: number[] };
  allocations: { labels: string[]; data: number[] };
};

export async function getInvestorSetupRows(): Promise<InvestorSetupRow[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ia.user_id, u.name, ia.amount, ia.content
     FROM invest_analyses ia
     INNER JOIN users u ON u.id = ia.user_id
     WHERE ia.status = 'setup'`,
  );
  return rows.map((r) => ({
    user_id: Number(r.user_id),
    name: String(r.name ?? ""),
    amount: Number(r.amount ?? 0),
    percent: Number(r.content ?? 0),
  }));
}

export async function getInvestmentSums(forUserId?: number): Promise<{ pending: number; completed: number }> {
  const pool = getPool();
  if (forUserId != null && Number.isFinite(forUserId)) {
    const uid = Number(forUserId);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM invest_analyses WHERE user_id = ? AND status = 'pending') AS pending,
        (SELECT COALESCE(SUM(amount), 0) FROM invest_analyses WHERE user_id = ? AND status = 'completed') AS completed`,
      [uid, uid],
    );
    const r = rows[0];
    return { pending: Number(r?.pending ?? 0), completed: Number(r?.completed ?? 0) };
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM invest_analyses WHERE status = 'pending') AS pending,
      (SELECT COALESCE(SUM(amount), 0) FROM invest_analyses WHERE status = 'completed') AS completed`,
  );
  const r = rows[0];
  return { pending: Number(r?.pending ?? 0), completed: Number(r?.completed ?? 0) };
}

export async function getInvestmentTransactionsPage(
  forUserId: number | null,
  page: number,
): Promise<{ rows: RowDataPacket[]; total: number }> {
  const pool = getPool();
  const perPage = 24;
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * perPage;

  const where = forUserId != null ? "WHERE user_id = ?" : "";
  const params: SqlParams = forUserId != null ? [forUserId] : [];

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM invest_analyses ${where}`,
    params,
  );
  const total = Number(countRows[0]?.c ?? 0);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM invest_analyses ${where} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`,
    params,
  );

  return { rows, total };
}

export async function buildInvestmentCharts(
  viewerUserId: number,
  isAdmin: boolean,
): Promise<InvestmentChartPack> {
  const investors = await getInvestorSetupRows();
  const labels = investors.map((inv) =>
    inv.user_id === viewerUserId ? `${inv.name} (you)` : inv.name,
  );
  const data = investors.map((inv) => inv.percent);

  let allocations: { labels: string[]; data: number[] };
  if (isAdmin) {
    const totalMoney = investors.reduce((s, i) => s + i.amount, 0);
    const sums = await getInvestmentSums(undefined);
    const uninvested = Math.max(0, totalMoney - sums.completed - sums.pending);
    allocations = {
      labels: [`Unallocated $${uninvested}`, `Invested $${sums.completed}`, `Pending $${sums.pending}`],
      data: [uninvested, sums.completed, sums.pending],
    };
  } else {
    const setup = investors.find((i) => i.user_id === viewerUserId);
    const base = setup?.amount ?? 0;
    const sums = await getInvestmentSums(viewerUserId);
    const remains = Math.max(0, base - sums.completed);
    allocations = {
      labels: [`Remaining $${remains}`, `Invested $${sums.completed}`],
      data: [remains, sums.completed],
    };
  }

  return {
    investors: { labels: labels.length ? labels : ["No investors"], data: labels.length ? data : [0] },
    allocations,
  };
}
