import "server-only";
import type { RowDataPacket } from "mysql2";
import { format } from "date-fns";
import { getPool } from "@/lib/db";

export type PageSettingRow = {
  id: number;
  page: string;
  key: string;
  is_json: number | null;
  content: string;
  created_at: string;
  updated_at: string;
  created_date: string;
  preview: string;
};

function fmtDate(s: unknown): string {
  if (!s) return "—";
  try {
    return format(new Date(String(s)), "dd.MM.yyyy");
  } catch {
    return String(s);
  }
}

function preview(content: string): string {
  const c = content.replace(/\s+/g, " ").trim();
  return c.length > 80 ? `${c.slice(0, 77)}…` : c;
}

export async function getPageSettings(): Promise<PageSettingRow[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, page, \`key\`, is_json, content, created_at, updated_at
       FROM page_settings
       ORDER BY created_at DESC`,
  );
  return rows.map((r) => {
    const content = r.content == null ? "" : String(r.content);
    return {
      id: Number(r.id),
      page: String(r.page ?? ""),
      key: String(r.key ?? ""),
      is_json: r.is_json == null ? null : Number(r.is_json),
      content,
      created_at: r.created_at ? String(r.created_at) : "",
      updated_at: r.updated_at ? String(r.updated_at) : "",
      created_date: fmtDate(r.created_at),
      preview: preview(content),
    };
  });
}

export async function getPageSettingById(id: number): Promise<PageSettingRow | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, page, \`key\`, is_json, content, created_at, updated_at
       FROM page_settings WHERE id = ? LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  const content = r.content == null ? "" : String(r.content);
  return {
    id: Number(r.id),
    page: String(r.page ?? ""),
    key: String(r.key ?? ""),
    is_json: r.is_json == null ? null : Number(r.is_json),
    content,
    created_at: r.created_at ? String(r.created_at) : "",
    updated_at: r.updated_at ? String(r.updated_at) : "",
    created_date: fmtDate(r.created_at),
    preview: preview(content),
  };
}

export type PageSettingValidationResult =
  | { ok: true; normalised: string; isJson: number | null }
  | { ok: false; error: string };

export function validatePageSettingContent(
  rawContent: string,
  isJsonRaw: string | number | null,
): PageSettingValidationResult {
  const isJsonNum = isJsonRaw == null ? 0 : Number(isJsonRaw);
  if (!Number.isFinite(isJsonNum)) {
    return { ok: false, error: "Invalid is_json flag" };
  }
  if (isJsonNum === 1) {
    try {
      JSON.parse(rawContent);
    } catch {
      return { ok: false, error: "Content is not valid JSON" };
    }
    return { ok: true, normalised: rawContent, isJson: 1 };
  }
  if (isJsonNum === 2) {
    const trimmed = rawContent.replace(/[\r\n]+/g, "").trim();
    if (!trimmed) return { ok: false, error: "Provide key=value pairs separated by commas" };
    const obj: Record<string, string> = {};
    for (const pair of trimmed.split(",")) {
      const [k, ...rest] = pair.split("=");
      if (!k || rest.length === 0) {
        return { ok: false, error: `Invalid pair: "${pair}"` };
      }
      obj[k.trim()] = rest.join("=").trim();
    }
    return { ok: true, normalised: JSON.stringify(obj), isJson: 2 };
  }
  return { ok: true, normalised: rawContent, isJson: isJsonNum === 0 ? null : isJsonNum };
}

export function parsePageSettingForEdit(row: PageSettingRow): {
  isJson: number;
  contentForForm: string;
  parsedJson?: Record<string, unknown> | null;
  pairsString?: string;
} {
  if (row.is_json === 1) {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(row.content) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
    return { isJson: 1, contentForForm: row.content, parsedJson: parsed };
  }
  if (row.is_json === 2) {
    try {
      const obj = JSON.parse(row.content) as Record<string, unknown>;
      const pairs = Object.entries(obj).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
      return {
        isJson: 2,
        contentForForm: pairs.join(",\n"),
        pairsString: pairs.join(",\n"),
      };
    } catch {
      return { isJson: 2, contentForForm: row.content };
    }
  }
  return { isJson: 0, contentForForm: row.content };
}
