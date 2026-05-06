import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import {
  adminSearchTypeList,
  runAdminDbSearch,
  ADMIN_DB_SEARCH_PAGE_SIZE,
  type AdminSearchType,
} from "@/lib/admin/db-search";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Search — Admin",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

export default async function AdminSearchPage({ searchParams }: PageProps) {
  ensureInvestor(await getSessionUser());
  const sp = await searchParams;

  const searchQuery = first(sp, "searchQuery");
  const searchLike = first(sp, "searchLike") === "1";
  const searchTypeRaw = first(sp, "searchType") || "users";
  const searchSelectCols = first(sp, "searchSelectCols") || "main";
  const searchOrderBy = first(sp, "searchOrderBy") || "";
  const pageRaw = first(sp, "page");
  const page = Number(pageRaw);

  const types = adminSearchTypeList();
  const searchType = types.some((t) => t.id === searchTypeRaw)
    ? (searchTypeRaw as AdminSearchType)
    : "users";

  const result = await runAdminDbSearch({
    searchType,
    searchQuery,
    searchLike,
    searchSelectCols,
    searchOrderBy,
    page,
  });

  const baseQs = new URLSearchParams();
  if (searchQuery) baseQs.set("searchQuery", searchQuery);
  if (searchLike) baseQs.set("searchLike", "1");
  baseQs.set("searchType", searchType);
  if (searchSelectCols && searchSelectCols !== "main") baseQs.set("searchSelectCols", searchSelectCols);
  if (searchOrderBy) baseQs.set("searchOrderBy", searchOrderBy);

  const pageLink = (p: number) => {
    const q = new URLSearchParams(baseQs);
    q.set("page", String(p));
    return `/adminzone/search?${q.toString()}`;
  };

  const totalPages =
    result.ok && result.total > 0 ? Math.max(1, Math.ceil(result.total / ADMIN_DB_SEARCH_PAGE_SIZE)) : 1;

  const columnKeys =
    result.ok && result.rows.length > 0
      ? Object.keys(result.rows[0] as object)
      : result.ok
        ? result.config.select
        : [];

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Search by DB</CardTitle>
          <p className="text-sm text-muted-foreground">
            Laravel-style lookup across core tables. Use exact match or enable <strong>LIKE</strong>. For one column, use{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">column:value</code>.
          </p>
        </CardHeader>
        <CardContent>
          <form action="/adminzone/search" method="get" className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="searchQuery">Query</Label>
                <Input
                  id="searchQuery"
                  name="searchQuery"
                  defaultValue={searchQuery}
                  placeholder='e.g. 1849 or email@gmail.com or author_id:12'
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="searchType">Table</Label>
                <select
                  id="searchType"
                  name="searchType"
                  defaultValue={searchType}
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="searchOrderBy">Order</Label>
                <Input
                  id="searchOrderBy"
                  name="searchOrderBy"
                  defaultValue={searchOrderBy}
                  placeholder="id-desc"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="searchLike"
                  value="1"
                  defaultChecked={searchLike}
                  className="size-4 rounded border-input accent-primary"
                />
                <span>LIKE match</span>
              </label>
              <input type="hidden" name="searchSelectCols" value={searchSelectCols || "main"} />
              <Button type="submit" size="sm">
                Search
              </Button>
              <Link href="/adminzone/search" className="text-sm text-muted-foreground hover:text-foreground">
                Reset
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {!result.ok ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {result.error}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              <Badge variant="outline">{result.config.title}</Badge>
              <span className="ml-2 tabular-nums">
                {result.total} row{result.total === 1 ? "" : "s"}
                {searchQuery ? "" : " (no filter — first page)"}
              </span>
            </span>
            {totalPages > 1 ? (
              <span className="flex flex-wrap gap-2">
                {result.page > 1 ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={pageLink(result.page - 1)}>Previous</Link>
                  </Button>
                ) : null}
                <span className="self-center tabular-nums">
                  Page {result.page} / {totalPages}
                </span>
                {result.page < totalPages ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={pageLink(result.page + 1)}>Next</Link>
                  </Button>
                ) : null}
              </span>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="border-b border-border/60 bg-muted/40">
                <tr>
                  {columnKeys.map((k) => (
                    <th key={k} className="whitespace-nowrap px-3 py-2 font-semibold">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-muted-foreground" colSpan={Math.max(columnKeys.length, 1)}>
                      No rows.
                    </td>
                  </tr>
                ) : (
                  result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border/40 odd:bg-muted/10">
                      {columnKeys.map((k) => (
                        <td
                          key={k}
                          className="max-w-[280px] whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs"
                        >
                          {fmtCell(row[k])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
