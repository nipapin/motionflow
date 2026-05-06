import "server-only";
import type { RowDataPacket } from "mysql2";
import { format } from "date-fns";
import { getPool } from "@/lib/db";

export const ADMIN_MAILING_PER_PAGE = 24;

export const MAILING_TYPES: Record<string, string> = {
  discount_items: "Discount Items (autopick)",
  free_items: "Free Items (autopick)",
  new_items: "New Items (autopick)",
  offer: "Offer (autopick)",
  collection: "Collection (autopick)",
  special_coupon: "Special Coupon",
  contest: "Contest",
  custom: "Custom",
};

export const MAILING_RECIPIENTS: Record<string, string> = {
  all: "Main Mailing (newsletter / users)",
  all_users: "All Users (subscribed)",
  main_newsletter: "Only Newsletter (without users)",
  authors_affiliates: "All Authors & Affiliates",
  only_buyers: "Only Buyers",
  only_refund_buyers: "Only Refunded Buyers",
  only_authors: "Only Authors",
  only_affiliates: "Only Affiliates",
};

export const MAILING_SUBSCRIBE_TYPES: Record<string, string> = {
  "-1": "Everyone (excludes unsubscribes)",
  "1": "AtomX Newsletter",
  "2": "Marketplace Newsletter",
};

export const MAILING_SAMPLING_DAYS: Record<string, string> = {
  "0": "All",
  "30": "Last Month (30 days)",
  "120": "Last Quarter (120 days)",
  "365": "Last Year (365 days)",
};

export const MAILING_FOOTER: Record<string, string> = {
  subscription: "Show Subscription Block",
  free_items: "Show Free Items Block",
  offer: "Show Offer Block",
};

export type MailingRow = {
  id: number;
  status: number;
  auto_type_picks: number;
  subscribe_type: number | null;
  type: string;
  recipients: string;
  sampling_days: number;
  max_emails: number | null;
  footer: string | null;
  poster: number | null;
  assigned_offer: number | null;
  subject: string | null;
  title: string;
  subtitle: string | null;
  custom_items: string | null;
  parsed_emails: number | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
  created_date: string;
  updated_date: string;
  status_label: string;
  status_tone: "active" | "scheduled" | "finished" | "draft" | "completed";
};

function fmtDate(s: unknown): string {
  if (!s) return "—";
  try {
    return format(new Date(String(s)), "dd.MM.yyyy");
  } catch {
    return String(s);
  }
}

function statusFor(start: unknown, end: unknown, status: number): { label: string; tone: MailingRow["status_tone"] } {
  if (status === 1 && start) {
    return { label: `Sent at ${fmtDate(start)}`, tone: "completed" };
  }
  if (start && end) {
    const now = new Date();
    const s = new Date(String(start));
    const e = new Date(String(end));
    if (s <= now && e >= now) {
      const days = Math.ceil((e.getTime() - now.getTime()) / 86_400_000);
      return { label: `Active — ${days} day(s) left`, tone: "active" };
    }
    if (s > now) {
      const days = Math.ceil((s.getTime() - now.getTime()) / 86_400_000);
      return { label: `Scheduled — starts in ${days} day(s)`, tone: "scheduled" };
    }
    return { label: "Finished window", tone: "finished" };
  }
  return { label: "Draft / unscheduled", tone: "draft" };
}

function rowToMailingRow(r: RowDataPacket): MailingRow {
  const status = statusFor(r.start_at, r.end_at, Number(r.status ?? 0));
  return {
    id: Number(r.id),
    status: Number(r.status ?? 0),
    auto_type_picks: Number(r.auto_type_picks ?? 0),
    subscribe_type: r.subscribe_type == null ? null : Number(r.subscribe_type),
    type: String(r.type ?? "custom"),
    recipients: String(r.recipients ?? "all"),
    sampling_days: Number(r.sampling_days ?? 0),
    max_emails: r.max_emails == null ? null : Number(r.max_emails),
    footer: r.footer == null ? null : String(r.footer),
    poster: r.poster == null ? null : Number(r.poster),
    assigned_offer: r.assigned_offer == null ? null : Number(r.assigned_offer),
    subject: r.subject == null ? null : String(r.subject),
    title: String(r.title ?? ""),
    subtitle: r.subtitle == null ? null : String(r.subtitle),
    custom_items: r.custom_items == null ? null : String(r.custom_items),
    parsed_emails: r.parsed_emails == null ? null : Number(r.parsed_emails),
    start_at: r.start_at == null ? null : String(r.start_at),
    end_at: r.end_at == null ? null : String(r.end_at),
    created_at: r.created_at ? String(r.created_at) : "",
    updated_at: r.updated_at ? String(r.updated_at) : "",
    created_date: fmtDate(r.created_at),
    updated_date: fmtDate(r.updated_at),
    status_label: status.label,
    status_tone: status.tone,
  };
}

export async function getMailingAdminPage(
  page: number,
): Promise<{ rows: MailingRow[]; total: number }> {
  const pool = getPool();
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * ADMIN_MAILING_PER_PAGE;

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM mailing_marketings`,
  );
  const total = Number(countRows[0]?.c ?? 0);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, status, auto_type_picks, subscribe_type, type, recipients, sampling_days,
            max_emails, footer, poster, assigned_offer, subject, title, subtitle, custom_items,
            parsed_emails, start_at, end_at, created_at, updated_at
       FROM mailing_marketings
       ORDER BY created_at DESC
       LIMIT ${ADMIN_MAILING_PER_PAGE} OFFSET ${offset}`,
  );

  return {
    rows: rows.map(rowToMailingRow),
    total,
  };
}

export async function getMailingById(id: number): Promise<MailingRow | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, status, auto_type_picks, subscribe_type, type, recipients, sampling_days,
            max_emails, footer, poster, assigned_offer, subject, title, subtitle, custom_items,
            parsed_emails, start_at, end_at, created_at, updated_at
       FROM mailing_marketings WHERE id = ? LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return rowToMailingRow(r);
}

/** Approximate Laravel `MailingMarketing::mailingListPreparing` count. */
export async function previewRecipientsCount(input: {
  recipients: string;
  samplingDays: number;
  subscribeType: number;
  maxEmails: number | null;
}): Promise<number> {
  const pool = getPool();
  const { recipients, samplingDays, subscribeType, maxEmails } = input;

  const params: (string | number)[] = [];
  let userQuery = "SELECT COUNT(*) AS c FROM users WHERE 1=1";
  const cond: string[] = [];
  if (subscribeType === -1) {
    cond.push("mailing IS NOT NULL");
  } else if (subscribeType === 0) {
    cond.push("mailing = 0");
  } else {
    cond.push("mailing IN (0, ?)");
    params.push(subscribeType);
  }
  if (samplingDays > 0) {
    cond.push("created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)");
    params.push(samplingDays);
  }

  switch (recipients) {
    case "authors_affiliates":
      cond.push("access IN (1, 2, 10)");
      break;
    case "only_authors":
      cond.push("access IN (2, 10)");
      break;
    case "only_affiliates":
      cond.push("access = 1");
      break;
    case "only_buyers":
      cond.push("EXISTS (SELECT 1 FROM sold_items s WHERE s.buyer_id = users.id AND s.status = 1)");
      break;
    case "only_refund_buyers":
      cond.push("EXISTS (SELECT 1 FROM sold_items s WHERE s.buyer_id = users.id AND s.status = 0)");
      break;
    default:
      break;
  }

  if (cond.length) {
    userQuery += ` AND ${cond.join(" AND ")}`;
  }
  if (maxEmails && maxEmails > 0) {
    userQuery = `SELECT LEAST(?, x.c) AS c FROM (${userQuery}) x`;
    params.unshift(maxEmails);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(userQuery, params);
  return Number(rows[0]?.c ?? 0);
}
