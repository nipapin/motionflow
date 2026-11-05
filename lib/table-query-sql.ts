import "server-only";
import type { TableViewState, TableFacet } from "@/lib/table-query";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

export type SqlTableColumns = Record<string, { sql: string; kind?: "text" | "number" | "date" }>;

export function tableWhereSql(state: TableViewState | undefined, columns: SqlTableColumns, omitColumn?: string) {
  const clauses: string[] = [], params: (string | number)[] = [];
  for (const [id, filter] of Object.entries(state?.filters ?? {})) {
    if (id === omitColumn) continue;
    const column = Object.hasOwn(columns, id) ? columns[id] : undefined;
    if (!column) throw new Error("Unknown table column");
    const expr = column.kind === "date" ? `COALESCE(DATE_FORMAT(${column.sql}, '%Y-%m-%d'), '')` : `COALESCE(CAST(${column.sql} AS CHAR), '')`;
    if (filter.values !== null) {
      if (!filter.values.length) { if (!filter.exclude) clauses.push("0=1"); }
      else { clauses.push(`${expr} ${filter.exclude ? "NOT IN" : "IN"} (${filter.values.map(() => "?").join(",")})`); params.push(...filter.values); }
    }
    const value = filter.value;
    const escaped = value.replace(/[!%_]/g, "!$&");
    switch (filter.operator) {
      case "empty": clauses.push(`${expr} = ''`); break;
      case "not_empty": clauses.push(`${expr} <> ''`); break;
      case "equals": case "not_equals":
        if (column.kind === "number") {
          if (!Number.isFinite(Number(value))) throw new Error("Invalid numeric filter");
          clauses.push(`(${expr} <> '' AND CAST(${expr} AS DECIMAL(30,8)) ${filter.operator === "equals" ? "=" : "<>"} ?)`); params.push(Number(value));
        } else { clauses.push(`LOWER(${expr}) ${filter.operator === "equals" ? "=" : "<>"} LOWER(?)`); params.push(value); }
        break;
      case "contains": case "not_contains": case "starts_with": case "ends_with":
        clauses.push(`LOWER(${expr}) ${filter.operator === "not_contains" ? "NOT LIKE" : "LIKE"} LOWER(?) ESCAPE '!'`);
        params.push(`${filter.operator === "starts_with" ? "" : "%"}${escaped}${filter.operator === "ends_with" ? "" : "%"}`); break;
      case "greater": case "less":
        if (!Number.isFinite(Number(value))) throw new Error("Invalid numeric filter");
        clauses.push(`(${expr} <> '' AND CAST(${expr} AS DECIMAL(30,8)) ${filter.operator === "greater" ? ">" : "<"} ?)`); params.push(Number(value)); break;
      case "before": case "after": clauses.push(`(${expr} <> '' AND ${expr} ${filter.operator === "before" ? "<" : ">"} ?)`); params.push(value); break;
    }
  }
  return { sql: clauses.join(" AND "), params };
}

export function tableOrderSql(state: TableViewState | undefined, columns: SqlTableColumns, fallback: string) {
  if (!state?.sort) return fallback;
  const column = Object.hasOwn(columns, state.sort.columnId) ? columns[state.sort.columnId] : undefined;
  if (!column) throw new Error("Unknown table sort");
  const direction = state.sort.direction === "asc" ? "ASC" : "DESC";
  return `ORDER BY (${column.sql} IS NULL OR CAST(${column.sql} AS CHAR) = '') ASC, ${column.sql} ${direction}`;
}

/** fromSql must include WHERE. Facets omit only the current column's filter. */
export async function readTableFacet(fromSql: string, params: (string | number)[], columns: SqlTableColumns, columnId: string, search: string): Promise<TableFacet> {
  const column = Object.hasOwn(columns, columnId) ? columns[columnId] : undefined;
  if (!column) throw new Error("Unknown table column");
  const expr = column.kind === "date" ? `COALESCE(DATE_FORMAT(${column.sql}, '%Y-%m-%d'), '')` : `COALESCE(CAST(${column.sql} AS CHAR), '')`;
  const [rows] = await getPool().execute<(RowDataPacket & { value: string; count: number })[]>(
    `SELECT ${expr} AS value, COUNT(*) AS count ${fromSql} AND ${expr} LIKE ? ESCAPE '!' GROUP BY ${expr} ORDER BY value LIMIT 201`,
    [...params, `%${search.slice(0, 200).replace(/[!%_]/g, "!$&")}%`],
  );
  return { options: rows.slice(0, 200).map((row) => ({ value: String(row.value), label: row.value === "" ? "(Blanks)" : String(row.value), count: Number(row.count) })), truncated: rows.length > 200 };
}
