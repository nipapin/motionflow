"use client";

import { Children, cloneElement, isValidElement, useMemo, type ComponentProps, type ElementType, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { TableColumnMenu } from "@/components/ui/table-column-menu";
import { useTableView, type TableColumn } from "@/hooks/use-table-view";
import type { ServerTableController } from "@/hooks/use-server-table";

type Node = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
const elements = (children: ReactNode): Node[] => Children.toArray(children).filter(isValidElement) as Node[];

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).filter(Boolean).join(" ");
  if (!isValidElement(node)) return "";
  const props = node.props as { children?: ReactNode; className?: string; "aria-hidden"?: boolean };
  if (props["aria-hidden"] || props.className?.includes("sr-only")) return "";
  return textContent(props.children);
}

function cellValue(cell: Node | undefined): string | number {
  if (!cell) return "";
  const explicit = cell.props["data-value"];
  if (explicit !== undefined) return explicit == null ? "" : String(explicit);
  const text = textContent(cell.props.children).trim();
  return text === "—" || text === "–" ? "" : text;
}

type Props = ComponentProps<"table"> & {
  headerType?: ElementType;
  bodyType?: ElementType;
  server?: ServerTableController;
};

/** Enhances declarative table rows while retaining their links, actions and styling. */
export function FilterableTable({ children, headerType = "thead", bodyType = "tbody", server, ...props }: Props) {
  const sections = elements(children);
  const header = sections.find((node) => node.type === headerType || node.props["data-table-section"] === "head");
  const body = sections.find((node) => node.type === bodyType || node.props["data-table-section"] === "body");
  const headerRow = header && elements(header.props.children)[0];
  const heads = headerRow ? elements(headerRow.props.children) : [];
  const data = useMemo(() => body ? elements(body.props.children).filter((row) => elements(row.props.children).every((cell) => !cell.props.colSpan || Number(cell.props.colSpan) === 1)) : [], [body]);
  const columns = useMemo<TableColumn<Node>[]>(() => heads.flatMap((head, index) => {
    const label = textContent(head.props.children).trim();
    if (!label || label.toLowerCase() === "actions" || head.props["data-filterable"] === false) return [];
    const explicitKind = head.props["data-kind"] as TableColumn<Node>["kind"];
    const samples = data.slice(0, 20).map((row) => cellValue(elements(row.props.children)[index])).filter((value) => value !== "");
    const numeric = samples.length > 0 && samples.every((value) => /^(?:[$€£]\s*)?-?\d[\d,.\s]*(?:%|[A-Z]{3})?$/.test(String(value)));
    const kind = explicitKind ?? (/date|registered|updated|created|paid at|last seen|when|until|expires|^ends$|modified/i.test(label) ? "date" : numeric || /^(id|#)$|count|amount|total|balance|views|selected|saved|downloads|purchases|recipients|sent|errors|sold items|devices|packs|users|ai \/ extension|cost|duration|^size$/i.test(label) ? "number" : "text");
    const getRaw = (row: Node) => cellValue(elements(row.props.children)[index]);
    const getValue = (row: Node) => {
      const raw = getRaw(row);
      if (kind === "number") {
        const numeric = Number(String(raw).replace(/[$€£,%\sA-Z]/g, ""));
        return raw !== "" && Number.isFinite(numeric) ? numeric : raw;
      }
      if (kind === "date" && raw !== "") {
        const date = new Date(raw);
        if (Number.isFinite(date.getTime())) return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      }
      return raw;
    };
    return [{ id: String(head.props["data-column"] ?? index), label, kind, getValue,
      getSortValue: kind === "date" ? (row: Node) => { const value = getRaw(row); return value === "" ? null : Date.parse(String(value)); } : undefined }];
  }), [headerRow, data]);
  const table = useTableView(data, columns);
  const filters = server?.state.filters ?? table.filters;
  const sort = server?.state.sort ?? table.sort;
  const hasChanges = Object.keys(filters).length > 0 || sort !== null;
  const visible = server ? data : table.rows;
  const reset = () => server ? server.onChange({ filters: {}, sort: null }) : table.reset();

  return <>
    {hasChanges ? <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-2 py-2 text-xs text-muted-foreground" role="status">
      <span>{server ? "Column filters and sorting apply to all results" : `${visible.length} of ${data.length} rows`}</span>
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={reset}>Reset table</Button>
    </div> : null}
    <table {...props}>
      {sections.map((section, sectionIndex) => {
        if (section === header && headerRow) return cloneElement(section, { key: section.key ?? sectionIndex }, cloneElement(headerRow, {}, heads.map((head, index) => {
          const column = columns.find((item) => item.id === String(head.props["data-column"] ?? index));
          if (!column) return head;
          return cloneElement(head, { key: head.key ?? index, scope: "col", "aria-sort": sort?.columnId === column.id ? sort.direction === "asc" ? "ascending" : "descending" : undefined }, <TableColumnMenu
            label={column.label} kind={column.kind} options={table.options[column.id] ?? []} filter={filters[column.id]}
            direction={sort?.columnId === column.id ? sort.direction : undefined}
            loadOptions={server ? (search, signal) => server.loadOptions(column.id, search, signal) : undefined}
            onSort={(direction) => server ? server.onChange({ filters, sort: direction ? { columnId: column.id, direction } : null }) : table.setSort(direction ? { columnId: column.id, direction } : null)}
            onFilter={(filter) => {
              if (!server) { table.setColumnFilter(column.id, filter); return; }
              const next = { ...filters };
              if (!filter || (filter.values === null && filter.operator === "none")) delete next[column.id];
              else next[column.id] = filter;
              server.onChange({ filters: next, sort });
            }}
          />);
        })));
        if (section === body) return cloneElement(section, { key: section.key ?? sectionIndex }, <>
          {data.length > 0 || hasChanges ? elements(section.props.children).filter((row) => row.props["data-table-pinned"]) : null}
          {visible.length ? visible : data.length === 0 && !hasChanges ? section.props.children : <tr><td colSpan={Math.max(1, heads.length)} className="px-4 py-10 text-center text-sm text-muted-foreground">No matching rows.{hasChanges ? <Button type="button" variant="link" size="sm" onClick={reset}>Reset table</Button> : null}</td></tr>}
        </>);
        return section;
      })}
    </table>
  </>;
}
