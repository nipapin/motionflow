import "server-only";
import { odinManagementRequest } from "@/lib/odin-management";
import { applyTableView, parseTableView } from "@/lib/table-query";
import type { TableColumn } from "@/hooks/use-table-view";

type User = { id: string; name: string; lastname: string; email: string };
const columns: TableColumn<User>[] = [
  { id: "email", label: "Email", getValue: (row) => row.email },
  { id: "name", label: "Name", getValue: (row) => `${row.name || ""} ${row.lastname || ""}`.trim() },
];
const snapshots = new Map<string, { expires: number; data: Promise<User[]> }>();

function readAudience(q: string): Promise<User[]> {
  const cached = snapshots.get(q);
  if (cached && cached.expires > Date.now()) return cached.data;
  const data = (async () => {
    const first = await odinManagementRequest(new URLSearchParams({ q, page: "1" })) as { users: User[]; total: number };
    const users = [...first.users];
    const size = first.users.length;
    if (!size) return users;
    const pages = Math.ceil(first.total / size);
    // Odin exposes a paged integration API. Read complete pages before applying a view.
    for (let page = 2; page <= pages; page += 4) {
      const batches = await Promise.all(Array.from({ length: Math.min(4, pages - page + 1) }, (_, index) =>
        odinManagementRequest(new URLSearchParams({ q, page: String(page + index) })) as Promise<{ users: User[] }>
      ));
      for (const batch of batches) users.push(...batch.users);
    }
    return Array.from(new Map(users.map((user) => [user.id, user])).values());
  })();
  if (snapshots.size >= 10) snapshots.delete(snapshots.keys().next().value!);
  snapshots.set(q, { expires: Date.now() + 30000, data });
  void data.catch(() => { if (snapshots.get(q)?.data === data) snapshots.delete(q); });
  return data;
}

export async function readOdinUsersTable(params: URLSearchParams) {
  const state = parseTableView(params.get("tableView"));
  const facet = params.get("tableFacet");
  if (!facet && !state.sort && !Object.keys(state.filters).length) return null;
  if (Object.keys(state.filters).some((id) => !columns.some((column) => column.id === id)) || (state.sort && !columns.some((column) => column.id === state.sort!.columnId))) throw new Error("INVALID_INPUT");
  const users = await readAudience((params.get("q") || "").slice(0, 200));
  if (facet) {
    const column = columns.find((item) => item.id === facet);
    if (!column) throw new Error("INVALID_INPUT");
    const filters = { ...state.filters }; delete filters[facet];
    const rows = applyTableView(users, columns, { filters, sort: null });
    const search = (params.get("tableSearch") || "").toLocaleLowerCase();
    const values = new Map<string, number>();
    for (const row of rows) { const value = String(column.getValue(row) ?? ""); if (value.toLocaleLowerCase().includes(search)) values.set(value, (values.get(value) ?? 0) + 1); }
    const options = [...values].sort(([a], [b]) => a.localeCompare(b)).map(([value, count]) => ({ value, label: value || "(Blanks)", count }));
    return { options: options.slice(0, 200), truncated: options.length > 200 };
  }
  const filtered = applyTableView(users, columns, state);
  const rawPage = Number(params.get("page") || 1), page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  return { users: filtered.slice((page - 1) * 25, page * 25), total: filtered.length };
}
