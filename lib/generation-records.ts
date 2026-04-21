import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import type { GenerationTool } from "@/lib/generations";

const TABLE = "generation_records";

let tableEnsured = false;

async function ensureTable(): Promise<void> {
    if (tableEnsured) return;
    const pool = getPool();
    await pool.query(
        `CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
       id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       user_id BIGINT UNSIGNED NOT NULL,
       tool VARCHAR(32) NOT NULL,
       status VARCHAR(16) NOT NULL,
       settings JSON NOT NULL,
       result JSON NULL,
       error_message TEXT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       KEY idx_user_created (user_id, created_at),
       KEY idx_user_tool (user_id, tool)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
    tableEnsured = true;
}

export type GenerationRecordStatus = "ok" | "failed";

export interface InsertGenerationRecordInput {
    userId: number;
    tool: GenerationTool;
    status: GenerationRecordStatus;
    settings: Record<string, unknown>;
    result?: Record<string, unknown> | null;
    errorMessage?: string | null;
}

/**
 * Insert a history row. Returns the new row id, or 0 if insert failed (logged).
 */
export async function insertGenerationRecord(
    input: InsertGenerationRecordInput,
): Promise<number> {
    try {
        await ensureTable();
        const pool = getPool();
        const [header] = await pool.execute<ResultSetHeader>(
            `INSERT INTO \`${TABLE}\`
       (user_id, tool, status, settings, result, error_message)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [
                input.userId,
                input.tool,
                input.status,
                JSON.stringify(input.settings),
                input.result != null ? JSON.stringify(input.result) : null,
                input.errorMessage ?? null,
            ],
        );
        return Number(header.insertId) || 0;
    } catch (err) {
        console.error("[generation_records] insert failed:", err);
        return 0;
    }
}

export interface GenerationRecordRow {
    id: string;
    user_id: number;
    tool: GenerationTool;
    status: GenerationRecordStatus;
    settings: Record<string, unknown>;
    result: Record<string, unknown> | null;
    error_message: string | null;
    created_at: string;
}

type RawRow = RowDataPacket & {
    id: string | number | bigint;
    user_id: number;
    tool: string;
    status: string;
    settings: unknown;
    result: unknown;
    error_message: string | null;
    created_at: Date | string;
};

function parseRow(r: RawRow): GenerationRecordRow {
    return {
        id: String(r.id),
        user_id: Number(r.user_id),
        tool: r.tool as GenerationTool,
        status: r.status === "failed" ? "failed" : "ok",
        settings:
            typeof r.settings === "object" && r.settings !== null
                ? (r.settings as Record<string, unknown>)
                : {},
        result:
            typeof r.result === "object" && r.result !== null
                ? (r.result as Record<string, unknown>)
                : null,
        error_message: r.error_message,
        created_at:
            r.created_at instanceof Date
                ? r.created_at.toISOString().slice(0, 19).replace("T", " ")
                : String(r.created_at),
    };
}

export async function listGenerationRecords(
    userId: number,
    options: { tool?: GenerationTool; limit?: number } = {},
): Promise<GenerationRecordRow[]> {
    await ensureTable();
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const pool = getPool();
    const tool = options.tool;
    if (tool) {
        const [rows] = await pool.execute<RawRow[]>(
            `SELECT id, user_id, tool, status, settings, result, error_message, created_at
       FROM \`${TABLE}\`
       WHERE user_id = ? AND tool = ?
       ORDER BY created_at DESC
       LIMIT ${limit}`,
            [userId, tool],
        );
        return rows.map(parseRow);
    }
    const [rows] = await pool.execute<RawRow[]>(
        `SELECT id, user_id, tool, status, settings, result, error_message, created_at
       FROM \`${TABLE}\`
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${limit}`,
        [userId],
    );
    return rows.map(parseRow);
}

export async function deleteGenerationRecord(
    userId: number,
    recordId: string,
): Promise<boolean> {
    await ensureTable();
    const id = Number(recordId);
    if (!Number.isFinite(id) || id <= 0) {
        return false;
    }
    const pool = getPool();
    const [header] = await pool.execute<ResultSetHeader>(
        `DELETE FROM \`${TABLE}\` WHERE id = ? AND user_id = ?`,
        [id, userId],
    );
    return header.affectedRows > 0;
}
