"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader } from "mysql2";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isInvestor } from "@/lib/auth/access-control";
import { getPool } from "@/lib/db";
import {
  MAILING_FOOTER,
  MAILING_RECIPIENTS,
  MAILING_TYPES,
  previewRecipientsCount,
} from "@/lib/admin/mailing";

async function requireStaff() {
  const u = await getSessionUser();
  if (!u || !isInvestor(u)) throw new Error("Forbidden");
  return u;
}

function revalidate() {
  revalidatePath("/adminzone/mailing_marketing", "layout");
}

export type MailingActionResult = { ok: true; id?: number } | { ok: false; error: string };

const TYPE_KEYS = Object.keys(MAILING_TYPES);
const RECIPIENT_KEYS = Object.keys(MAILING_RECIPIENTS);
const FOOTER_KEYS = Object.keys(MAILING_FOOTER);

export type MailingFormInput = {
  type: string;
  recipients: string;
  subscribeType: number;
  samplingDays: number;
  maxEmails?: number | null;
  title: string;
  subject?: string | null;
  subtitle?: string | null;
  customItems?: string | null;
  assignedOffer?: number | null;
  footer?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  autoTypePicks: boolean;
};

function validate(input: MailingFormInput): { ok: true } | { ok: false; error: string } {
  if (!TYPE_KEYS.includes(input.type)) return { ok: false, error: "Invalid type" };
  if (!RECIPIENT_KEYS.includes(input.recipients)) return { ok: false, error: "Invalid recipients" };
  if (!input.title?.trim()) return { ok: false, error: "Title required" };
  if (input.footer && !FOOTER_KEYS.includes(input.footer)) return { ok: false, error: "Invalid footer" };
  if (![-1, 0, 1, 2].includes(input.subscribeType)) return { ok: false, error: "Invalid subscribe type" };
  if (![0, 30, 120, 365].includes(input.samplingDays)) return { ok: false, error: "Invalid sampling days" };
  return { ok: true };
}

export async function createMailingAction(input: MailingFormInput): Promise<MailingActionResult> {
  await requireStaff();
  const v = validate(input);
  if (!v.ok) return v;

  const parsedEmails = await previewRecipientsCount({
    recipients: input.recipients,
    samplingDays: input.samplingDays,
    subscribeType: input.subscribeType,
    maxEmails: input.maxEmails ?? null,
  });

  const pool = getPool();
  const [res] = await pool.execute(
    `INSERT INTO mailing_marketings
       (status, auto_type_picks, subscribe_type, type, recipients, sampling_days, max_emails,
        footer, assigned_offer, subject, title, subtitle, custom_items, parsed_emails,
        start_at, end_at, created_at, updated_at)
     VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      input.autoTypePicks ? 1 : 0,
      input.subscribeType,
      input.type,
      input.recipients,
      input.samplingDays,
      input.maxEmails ?? null,
      input.footer || null,
      input.assignedOffer ?? null,
      input.subject?.trim() || null,
      input.title.trim(),
      input.subtitle?.trim() || null,
      input.customItems?.trim() || null,
      parsedEmails,
      input.startAt || null,
      input.endAt || null,
    ],
  );
  const id = (res as ResultSetHeader).insertId ?? 0;
  revalidate();
  return { ok: true, id };
}

export async function updateMailingAction(
  input: MailingFormInput & { id: number },
): Promise<MailingActionResult> {
  await requireStaff();
  if (!Number.isFinite(input.id) || input.id <= 0) return { ok: false, error: "Invalid mailing" };
  const v = validate(input);
  if (!v.ok) return v;

  const parsedEmails = await previewRecipientsCount({
    recipients: input.recipients,
    samplingDays: input.samplingDays,
    subscribeType: input.subscribeType,
    maxEmails: input.maxEmails ?? null,
  });

  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE mailing_marketings
        SET auto_type_picks = ?, subscribe_type = ?, type = ?, recipients = ?, sampling_days = ?,
            max_emails = ?, footer = ?, assigned_offer = ?, subject = ?, title = ?, subtitle = ?,
            custom_items = ?, parsed_emails = ?, start_at = ?, end_at = ?, updated_at = NOW()
        WHERE id = ?`,
    [
      input.autoTypePicks ? 1 : 0,
      input.subscribeType,
      input.type,
      input.recipients,
      input.samplingDays,
      input.maxEmails ?? null,
      input.footer || null,
      input.assignedOffer ?? null,
      input.subject?.trim() || null,
      input.title.trim(),
      input.subtitle?.trim() || null,
      input.customItems?.trim() || null,
      parsedEmails,
      input.startAt || null,
      input.endAt || null,
      input.id,
    ],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Mailing not found" };
  revalidate();
  return { ok: true, id: input.id };
}

export async function deleteMailingAction(id: number): Promise<MailingActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid mailing" };
  const pool = getPool();
  const [res] = await pool.execute(`DELETE FROM mailing_marketings WHERE id = ?`, [id]);
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Mailing not found" };
  revalidate();
  return { ok: true, id };
}

export async function markMailingSent(id: number): Promise<MailingActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid mailing" };
  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE mailing_marketings SET status = 1, start_at = COALESCE(start_at, NOW()), updated_at = NOW() WHERE id = ?`,
    [id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Mailing not found" };
  revalidate();
  return { ok: true, id };
}
