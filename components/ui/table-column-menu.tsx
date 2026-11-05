"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TableFilter, TableValueOption } from "@/hooks/use-table-view";
import type { TableFacet } from "@/lib/table-query";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  kind?: "text" | "number" | "date" | "boolean";
  options: TableValueOption[];
  filter?: TableFilter;
  direction?: "asc" | "desc";
  loadOptions?: (search: string, signal?: AbortSignal) => Promise<TableFacet>;
  onSort: (direction: "asc" | "desc" | null) => void;
  onFilter: (filter: TableFilter | null) => void;
};

export function TableColumnMenu({ label, kind = "text", options: initialOptions, filter, direction, onSort, onFilter, loadOptions }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exclude, setExclude] = useState(true);
  const [remote, setRemote] = useState<TableFacet>({ options: [], truncated: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loader = useRef(loadOptions);
  loader.current = loadOptions;
  const options = loadOptions ? remote.options : initialOptions;
  const [operator, setOperator] = useState("none");
  const [value, setValue] = useState("");
  const visibleOptions = options.filter((option) => option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const ascending = kind === "date" ? "Oldest to newest" : kind === "number" ? "Smallest to largest" : kind === "boolean" ? "Off to On" : "Sort A to Z";
  const descending = kind === "date" ? "Newest to oldest" : kind === "number" ? "Largest to smallest" : kind === "boolean" ? "On to Off" : "Sort Z to A";
  const needsValue = !["none", "empty", "not_empty"].includes(operator);
  const isSelected = (key: string) => exclude ? !selected.has(key) : selected.has(key);

  useEffect(() => {
    if (!open || !loader.current) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      void loader.current!(search, controller.signal).then((facet) => {
        if (!controller.signal.aborted) setRemote(facet);
      }).catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load values");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 200 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, search]);

  const changeOpen = (next: boolean) => {
    if (next) {
      setSearch("");
      setSelected(new Set(filter?.values ?? []));
      setExclude(filter?.values == null || filter.exclude === true);
      setOperator(filter?.operator ?? "none");
      setValue(filter?.value ?? "");
    }
    setOpen(next);
  };

  const selectVisible = (checked: boolean) => {
    if (!checked) { setExclude(false); setSelected(new Set()); return; }
    if (!search && !remote.truncated) { setExclude(true); setSelected(new Set()); return; }
    setExclude(false);
    setSelected(new Set(visibleOptions.map((option) => option.value)));
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("-mx-1 h-8 max-w-full gap-1.5 px-1 text-xs font-medium", (filter || direction) && "bg-accent text-accent-foreground")}
          aria-label={`${label}: sort and filter${filter ? ", filter active" : ""}${direction ? `, sorted ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
        >
          {label}
          {direction === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : direction === "desc" ? <ArrowDown className="size-3.5" aria-hidden /> : null}
          {filter ? <Filter className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[var(--radix-popover-content-available-height)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto p-0" aria-label={`${label} sort and filter`}>
        <div className="border-b p-2">
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{label}</p>
          {(["asc", "desc"] as const).map((order) => (
            <Button key={order} type="button" variant="ghost" size="sm" className="w-full justify-start" aria-pressed={direction === order} onClick={() => { onSort(order); setOpen(false); }}>
              {order === "asc" ? <ArrowUp className="size-4" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}
              {order === "asc" ? ascending : descending}
            </Button>
          ))}
          {direction ? <Button type="button" variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => { onSort(null); setOpen(false); }}>Clear sorting</Button> : null}
        </div>
        <div className="space-y-2 border-b p-3">
          <label htmlFor={`${id}-condition`} className="text-xs font-medium">Filter by condition</label>
          <select id={`${id}-condition`} value={operator} onChange={(event) => setOperator(event.target.value)} className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-2 py-2 text-sm outline-none focus-visible:ring-2">
            <option value="none">None</option>
            <option value="empty">Is empty</option>
            <option value="not_empty">Is not empty</option>
            {kind === "text" ? <>
              <option value="contains">Text contains</option>
              <option value="not_contains">Text does not contain</option>
              <option value="starts_with">Text starts with</option>
              <option value="ends_with">Text ends with</option>
            </> : null}
            <option value="equals">Is equal to</option>
            <option value="not_equals">Is not equal to</option>
            {kind === "number" ? <><option value="greater">Greater than</option><option value="less">Less than</option></> : null}
            {kind === "date" ? <><option value="before">Date is before</option><option value="after">Date is after</option></> : null}
          </select>
          {needsValue ? kind === "boolean" ? <select aria-label={`${label} condition value`} value={value} onChange={(event) => setValue(event.target.value)} className="border-input bg-background h-8 w-full rounded-md border px-2 text-sm"><option value="">Choose value</option><option value="true">On</option><option value="false">Off</option></select> : <Input aria-label={`${label} condition value`} type={kind === "date" ? "date" : kind === "number" ? "number" : "text"} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Value" className="h-8" /> : null}
        </div>
        <div className="space-y-2 p-3 pb-2">
          <p className="text-xs font-medium">Filter by values</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" aria-hidden />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search values…" aria-label={`Search ${label} values`} className="h-8 pl-8" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <button type="button" className="rounded text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" disabled={visibleOptions.length === 0 || loading} onClick={() => selectVisible(true)}>{remote.truncated && loadOptions ? "Select shown" : "Select all"}</button>
              <button type="button" className="rounded text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" disabled={visibleOptions.length === 0} onClick={() => selectVisible(false)}>Clear</button>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{options.filter((option) => isSelected(option.value)).length} / {options.length}{remote.truncated && loadOptions ? "+" : ""}</span>
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto overscroll-contain px-2 pb-2" role="group" aria-label={`${label} values`}>
          {loading ? <p role="status" className="px-2 py-4 text-center text-sm text-muted-foreground">Loading values…</p> : error ? <p role="alert" className="px-2 py-3 text-sm text-destructive">{error}</p> : visibleOptions.length === 0 ? <p className="px-2 py-4 text-center text-sm text-muted-foreground">No matching values</p> : visibleOptions.map((option, index) => (
            <label key={option.value} htmlFor={`${id}-value-${index}`} className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm">
              <Checkbox id={`${id}-value-${index}`} checked={isSelected(option.value)} onCheckedChange={(checked) => setSelected((current) => {
                const next = new Set(current);
                if ((checked === true) !== exclude) next.add(option.value);
                else next.delete(option.value);
                return next;
              })} />
              <span className="min-w-0 flex-1 truncate" title={option.label}>{option.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{option.count}</span>
            </label>
          ))}
          {!loading && !error && loadOptions && remote.truncated ? <p className="px-2 py-2 text-xs text-muted-foreground">Showing the first 200 values. Search to find more.</p> : null}
          {selected.size > 500 ? <p className="px-2 py-2 text-xs text-destructive">Choose up to 500 values or use a condition.</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-3">
          {filter ? <Button type="button" variant="ghost" size="sm" className="mr-auto px-2 text-xs" onClick={() => { onFilter(null); setOpen(false); }}>Reset filter</Button> : null}
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" size="sm" disabled={(needsValue && value.trim() === "") || selected.size > 500} onClick={() => {
            onFilter({ values: exclude && selected.size === 0 ? null : [...selected], exclude, operator, value });
            setOpen(false);
          }}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
