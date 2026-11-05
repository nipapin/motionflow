import type { TableColumn, TableFilter, TableSort, TableValueOption } from "@/hooks/use-table-view";

export type TableViewState = { filters: Record<string, TableFilter>; sort: TableSort | null };
export type TableFacet = { options: TableValueOption[]; truncated: boolean };
export const EMPTY_TABLE_VIEW: TableViewState = { filters: {}, sort: null };

export function isTableQueryError(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof Error && /^(Invalid table|Invalid numeric filter|Unknown table|Too many table)/.test(error.message));
}

const operators = new Set(["none", "empty", "not_empty", "contains", "not_contains", "equals", "not_equals", "starts_with", "ends_with", "greater", "less", "before", "after"]);

/** Only bounded primitive state crosses the API boundary; SQL identifiers never do. */
export function parseTableView(raw: string | null): TableViewState {
  if (!raw) return EMPTY_TABLE_VIEW;
  if (raw.length > 32000) throw new Error("Invalid table filters");
  const input = JSON.parse(raw);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid table filters");
  const filters: Record<string, TableFilter> = Object.create(null);
  const entries = Object.entries(input.filters ?? {});
  if (entries.length > 30) throw new Error("Too many table filters");
  for (const [key, rawFilter] of entries) {
    const f = rawFilter as TableFilter;
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(key) || !f || !operators.has(f.operator) || typeof f.value !== "string" || f.value.length > 500 ||
        (f.values !== null && (!Array.isArray(f.values) || f.values.length > 500 || f.values.some((value) => typeof value !== "string" || value.length > 500)))) throw new Error("Invalid table filter");
    filters[key] = { values: f.values, operator: f.operator, value: f.value, exclude: f.exclude === true };
  }
  const sort = input.sort;
  if (sort != null && (!/^[a-zA-Z0-9_]{1,40}$/.test(sort.columnId) || !["asc", "desc"].includes(sort.direction))) throw new Error("Invalid table sort");
  return { filters, sort: sort ?? null };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function applyTableView<T>(data: T[], columns: TableColumn<T>[], state: TableViewState): T[] {
  const active = columns.flatMap((column) => {
    const filter = state.filters[column.id];
    return filter ? [{ column, filter, values: filter.values === null ? null : new Set(filter.values) }] : [];
  });
  const rows = data.filter((row) => active.every(({ column, filter, values }) => {
    const raw = column.getValue(row), value = raw == null ? "" : String(raw);
    if (values && (filter.exclude ? values.has(value) : !values.has(value))) return false;
    const text = value.toLocaleLowerCase(), target = filter.value.toLocaleLowerCase();
    switch (filter.operator) {
      case "empty": return value === "";
      case "not_empty": return value !== "";
      case "contains": return text.includes(target);
      case "not_contains": return !text.includes(target);
      case "equals": return column.kind === "number" ? value !== "" && Number(value) === Number(target) : text === target;
      case "not_equals": return column.kind === "number" ? value === "" || Number(value) !== Number(target) : text !== target;
      case "starts_with": return text.startsWith(target);
      case "ends_with": return text.endsWith(target);
      case "greater": return value !== "" && Number(value) > Number(target);
      case "less": return value !== "" && Number(value) < Number(target);
      case "before": return value !== "" && value < target;
      case "after": return value !== "" && value > target;
      default: return true;
    }
  }));
  const sort = state.sort, column = sort && columns.find((item) => item.id === sort.columnId);
  if (column && sort) rows.sort((a, b) => {
    const left = column.getSortValue ? column.getSortValue(a) : column.getValue(a);
    const right = column.getSortValue ? column.getSortValue(b) : column.getValue(b);
    const blank = (value: unknown) => value == null || value === "" || (typeof value === "number" && !Number.isFinite(value));
    if (blank(left) || blank(right)) return Number(blank(left)) - Number(blank(right));
    const order = typeof left === "number" && typeof right === "number" ? left - right : collator.compare(String(left), String(right));
    return sort.direction === "asc" ? order : -order;
  });
  return rows;
}
