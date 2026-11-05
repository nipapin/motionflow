"use client";

import { useCallback, useState } from "react";
import { EMPTY_TABLE_VIEW, type TableFacet, type TableViewState } from "@/lib/table-query";

export type ServerTableController = {
  state: TableViewState;
  onChange: (state: TableViewState) => void;
  loadOptions: (columnId: string, search: string, signal?: AbortSignal) => Promise<TableFacet>;
};

export function useServerTable(endpoint: string, onChangePage: () => void) {
  const [state, setState] = useState<TableViewState>(EMPTY_TABLE_VIEW);
  const query = JSON.stringify(state);
  const onChange = (next: TableViewState) => { setState(next); onChangePage(); };
  const loadOptions = useCallback(async (columnId: string, search: string, signal?: AbortSignal): Promise<TableFacet> => {
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.delete("export");
    url.searchParams.set("tableView", query);
    url.searchParams.set("tableFacet", columnId);
    url.searchParams.set("tableSearch", search);
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Could not load values. Close this menu and try again.");
    return response.json();
  }, [endpoint, query]);
  return { state, query, onChange, loadOptions, reset: () => setState(EMPTY_TABLE_VIEW) };
}
