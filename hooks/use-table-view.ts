"use client";

import { useMemo, useState } from "react";
import { applyTableView } from "@/lib/table-query";

export type TableColumn<T> = {
  id: string;
  label: string;
  kind?: "text" | "number" | "date" | "boolean";
  getValue: (row: T) => string | number | boolean | null | undefined;
  getSortValue?: (row: T) => string | number | null;
  formatValue?: (value: string) => string;
};

export type TableFilter = {
  values: string[] | null;
  exclude?: boolean;
  operator: string;
  value: string;
};

export type TableSort = { columnId: string; direction: "asc" | "desc" };
export type TableValueOption = { value: string; label: string; count: number };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const valueKey = (value: unknown) => value == null ? "" : String(value);

export function useTableView<T>(data: T[], columns: TableColumn<T>[]) {
  const [filters, setFilters] = useState<Record<string, TableFilter>>({});
  const [sort, setSort] = useState<TableSort | null>(null);

  const rows = useMemo(() => applyTableView(data, columns, { filters, sort }), [data, columns, filters, sort]);

  const options = useMemo(() => Object.fromEntries(columns.map((column) => {
    const values = new Map<string, TableValueOption>();
    for (const row of data) {
      const value = valueKey(column.getValue(row));
      const existing = values.get(value);
      if (existing) existing.count += 1;
      else values.set(value, {
        value,
        label: value === "" ? "(Blanks)" : column.formatValue?.(value) ?? value,
        count: 1,
      });
    }
    return [column.id, Array.from(values.values()).sort((a, b) => {
      if (a.value === "" || b.value === "") return Number(a.value === "") - Number(b.value === "");
      return collator.compare(a.label, b.label);
    })];
  })), [data, columns]);

  const setColumnFilter = (columnId: string, filter: TableFilter | null) => {
    setFilters((current) => {
      const next = { ...current };
      if (!filter || (filter.values === null && filter.operator === "none")) delete next[columnId];
      else next[columnId] = filter;
      return next;
    });
  };

  const reset = () => {
    setFilters({});
    setSort(null);
  };

  return { rows, options, filters, sort, setSort, setColumnFilter, reset, hasFilters: Object.keys(filters).length > 0 };
}
