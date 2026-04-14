import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

export interface SubscriptionListItem {
  subsFor: string;
  plan: string | null;
  subscriptionId: string;
  icon: string;
  invertIcon: boolean;
  productPage: string;
  active: boolean;
  cancelled: boolean;
  endDate: string | null;
  endsAt: string | null;
}

export function formatTokenPreview(id: string): string {
  if (id.length <= 28) return id;
  return `${id.slice(0, 16)} \u2026 ${id.slice(-4)}`;
}

type SubRow = RowDataPacket & {
  author_id: number | null;
  status: number;
  subscription_id: string;
  plan: string | null;
  ends_at: string | null;
  created_at: string | null;
};

const TITLES: Record<number | string, string> = {
  4141: "Premiere Gal Toolkit MAX",
  1691: "Spunkram Library",
};



const PRODUCT_PAGES: Record<number | string, string> = {
  4141: "https://premieregal.motionflow.pro",
  1691: "https://spunkram.motionflow.pro",
  "": "https://motionflow.pro",
};

const ICONS: Record<number | string, string> = {
  4141: "/assets/logo.png",
  1691: "/assets/spunkram-logo.png",
  "": "/assets/logo_square.png",
};

function formatDateDMY(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

const TABLE = "subscription_systems";

export async function getSubscriptionsForUser(
  userId: number,
): Promise<SubscriptionListItem[]> {
  const pool = getPool();
  const [rows] = await pool.execute<SubRow[]>(
    `SELECT author_id, status, subscription_id, plan, ends_at, created_at
     FROM \`${TABLE}\`
     WHERE buyer_id = ?
     ORDER BY id DESC`,
    [userId],
  );

  return rows.map((r) => {
    const authorKey = r.author_id ?? "";
    const hasKnownAuthor = r.author_id != null && r.author_id in ICONS;
    const subsFor = TITLES[authorKey] ?? "Motionflow Subscription";
    const icon = ICONS[authorKey] ?? ICONS[""];

    let active = false;
    let cancelled = false;
    let endDate: string | null = formatDateDMY(r.ends_at);

    if (r.status === 1) {
      active = true;
    }

    if (r.ends_at && r.status === -1) {
      cancelled = true;
      if (new Date(r.ends_at) > new Date()) {
        active = true;
      }
    }

    return {
      subsFor,
      plan: r.plan ?? null,
      subscriptionId: String(r.subscription_id ?? ""),
      icon,
      invertIcon: !hasKnownAuthor,
      productPage: PRODUCT_PAGES[authorKey] ?? PRODUCT_PAGES[""],
      active,
      cancelled,
      endDate,
      endsAt: r.ends_at ?? null,
    };
  });
}
