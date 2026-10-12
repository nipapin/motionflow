"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Search } from "lucide-react";
import {
  accessRoleLabel,
  formatAdminDate,
  ADMIN_USERS_PAGE_SIZE,
  ADMIN_USER_GOOGLE_FILTERS,
  ADMIN_USER_ROLE_FILTERS,
  ADMIN_USER_SOLD_FILTERS,
  ADMIN_USER_SUB_FILTERS,
  ADMIN_USER_VERIFIED_FILTERS,
  type AdminUserDetail,
  type AdminUserGoogleFilter,
  type AdminUserListRow,
  type AdminUserRoleFilter,
  type AdminUserSoldFilter,
  type AdminUserSortDir,
  type AdminUserSortField,
  type AdminUserSubFilter,
  type AdminUserVerifiedFilter,
} from "@/lib/admin-users-shared";
import { AdminUserDrawer } from "@/components/admin-user-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterSelect, DateFilter, UserCsvExport } from "@/components/user-list-controls";
import { MAILING_FILTERS, validateUserDateRanges, type MailingFilter } from "@/lib/user-list-filters";
import { cn } from "@/lib/utils";

type SearchResponse = {
  users: AdminUserListRow[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
};

function SortableHead({
  field,
  label,
  sort,
  dir,
  onSort,
  className,
  numeric,
}: {
  field: AdminUserSortField;
  label: string;
  sort: AdminUserSortField;
  dir: AdminUserSortDir;
  onSort: (field: AdminUserSortField) => void;
  className?: string;
  numeric?: boolean;
}) {
  const active = sort === field;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className={cn(
          "-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-medium hover:text-foreground",
          numeric && "w-full justify-end",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => onSort(field)}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export function AdminUsersSearch({ initial }: { initial: SearchResponse }) {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<AdminUserRoleFilter>("all");
  const [google, setGoogle] = useState<AdminUserGoogleFilter>("all");
  const [verified, setVerified] = useState<AdminUserVerifiedFilter>("all");
  const [sold, setSold] = useState<AdminUserSoldFilter>("all");
  const [subscription, setSubscription] = useState<AdminUserSubFilter>("all");
  const [mailing, setMailing] = useState<MailingFilter>("all");
  const [registeredFrom, setRegisteredFrom] = useState("");
  const [registeredTo, setRegisteredTo] = useState("");
  const [sort, setSort] = useState<AdminUserSortField>("id");
  const [dir, setDir] = useState<AdminUserSortDir>("desc");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse>(initial);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const skipInitialFetch = useRef(true);
  const qRef = useRef(q);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = draft.trim();
      if (qRef.current === next) return;
      qRef.current = next;
      setQ(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [draft]);

  function makeParams(search = q) {
    const params = new URLSearchParams({ page: String(page), sort, dir });
    if (search) params.set("q", search);
    if (role !== "all") params.set("role", role);
    if (google !== "all") params.set("google", google);
    if (verified !== "all") params.set("verified", verified);
    if (sold !== "all") params.set("sold", sold);
    if (subscription !== "all") params.set("sub", subscription);
    if (mailing !== "all") params.set("mailing", mailing);
    if (registeredFrom) params.set("registeredFrom", registeredFrom);
    if (registeredTo) params.set("registeredTo", registeredTo);
    return params;
  }

  useEffect(() => {
    if (
      skipInitialFetch.current &&
      q === "" &&
      page === 1 &&
      role === "all" &&
      mailing === "all" &&
      google === "all" &&
      verified === "all" &&
      sold === "all" &&
      subscription === "all" &&
      registeredFrom === "" &&
      registeredTo === "" &&
      sort === "id" &&
      dir === "desc"
    ) {
      skipInitialFetch.current = false;
      return;
    }
    skipInitialFetch.current = false;
    const ac = new AbortController();
    setBusy(true);
    setError(null);
    const params = makeParams();
    const dateError = validateUserDateRanges(params);
    if (dateError) { setError(dateError); setBusy(false); return; }
    void (async () => {
      try {
        const res = await fetch(`/api/admin/users?${params.toString()}`, {
          signal: ac.signal,
        });
        const data = (await res.json().catch(() => ({}))) as SearchResponse;
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setError(data.error ?? "Search failed");
          return;
        }
        setResult(data);
      } catch (err) {
        if (ac.signal.aborted) return;
        console.error("[admin-users-search]", err);
        setError("Network error. Try again.");
      } finally {
        if (!ac.signal.aborted) setBusy(false);
      }
    })();
    return () => ac.abort();
  }, [
    q,
    page,
    role,
    mailing,
    google,
    verified,
    sold,
    subscription,
    registeredFrom,
    registeredTo,
    sort,
    dir,
    refresh,
  ]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(result.total / (result.pageSize || ADMIN_USERS_PAGE_SIZE))),
    [result],
  );

  const applyRole = (next: AdminUserRoleFilter) => {
    setRole(next);
    setPage(1);
  };
  const applyGoogle = (next: AdminUserGoogleFilter) => {
    setGoogle(next);
    setPage(1);
  };
  const applyVerified = (next: AdminUserVerifiedFilter) => {
    setVerified(next);
    setPage(1);
  };
  const applySold = (next: AdminUserSoldFilter) => {
    setSold(next);
    setPage(1);
  };
  const applySubscription = (next: AdminUserSubFilter) => {
    setSubscription(next);
    setPage(1);
  };
  const applyRegisteredFrom = (next: string) => {
    setRegisteredFrom(next);
    setPage(1);
  };
  const applyRegisteredTo = (next: string) => {
    setRegisteredTo(next);
    setPage(1);
  };
  const applySort = (field: AdminUserSortField) => {
    if (sort === field) {
      setDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDir(
        field === "name" || field === "email" || field === "access" ? "asc" : "desc",
      );
    }
    setPage(1);
  };

  const resetFilters = () => {
    setDraft(""); setQ(""); qRef.current = ""; setPage(1);
    setRole("all"); setGoogle("all"); setVerified("all"); setSold("all");
    setSubscription("all"); setMailing("all"); setRegisteredFrom(""); setRegisteredTo("");
    setSort("id"); setDir("desc");
  };

  const openRow = (id: number) => setSelectedId(id);

  const onUserUpdated = (user: AdminUserDetail) => {
    setResult((prev) => ({
      ...prev,
      users: prev.users.map((row) =>
        row.id === user.id
          ? {
              ...row,
              name: user.name,
              email: user.email,
              access: user.access,
            }
          : row,
      ),
    }));
  };

  const onUserDeleted = (id: number) => {
    const total = Math.max(0, result.total - 1);
    const lastPage = Math.max(1, Math.ceil(total / (result.pageSize || ADMIN_USERS_PAGE_SIZE)));
    setSelectedId(null);
    setResult((prev) => ({
      ...prev,
      users: prev.users.filter((row) => row.id !== id),
      total,
    }));
    setPage((current) => Math.min(current, lastPage));
    setRefresh((current) => current + 1);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search users"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search by id, email, name, purchase code, subscription id…"
              className="pl-9"
            />
          </div>
          <UserCsvExport
            endpoint="/api/admin/users"
            params={makeParams(draft.trim())}
            disabled={busy || Boolean(validateUserDateRanges(makeParams()))}
          />
          <Button type="button" size="sm" variant="ghost" onClick={resetFilters}>
            Reset filters
          </Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <FilterSelect
            label="Role"
            value={role}
            options={ADMIN_USER_ROLE_FILTERS}
            onChange={applyRole}
          />
          <FilterSelect
            label="Google Account"
            value={google}
            options={ADMIN_USER_GOOGLE_FILTERS}
            onChange={applyGoogle}
          />
          <FilterSelect
            label="Email Verified"
            value={verified}
            options={ADMIN_USER_VERIFIED_FILTERS}
            onChange={applyVerified}
          />
          <FilterSelect
            label="Sold items"
            value={sold}
            options={ADMIN_USER_SOLD_FILTERS}
            onChange={applySold}
          />
          <FilterSelect
            label="Subscription"
            value={subscription}
            options={ADMIN_USER_SUB_FILTERS}
            onChange={applySubscription}
          />
          <FilterSelect
            label="Mailing consent"
            value={mailing}
            options={MAILING_FILTERS}
            onChange={(next) => { setMailing(next); setPage(1); }}
          />
          <DateFilter
            id="admin-users-registered-from"
            label="Registered from"
            value={registeredFrom}
            onChange={applyRegisteredFrom}
          />
          <DateFilter
            id="admin-users-registered-to"
            label="Registered to"
            value={registeredTo}
            min={registeredFrom || undefined}
            onChange={applyRegisteredTo}
          />
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">
            {result.total.toLocaleString()} {result.total === 1 ? "user" : "users"}
          </CardTitle>
          {busy ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating…
            </span>
          ) : null}
        </CardHeader>
        <CardContent>
          {result.users.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 px-6 py-12 text-center">
              <p className="font-medium text-foreground">No users found</p>
              <p className="text-sm text-muted-foreground">
                Try another search or clear the filters.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    field="id"
                    label="Id"
                    sort={sort}
                    dir={dir}
                    onSort={applySort}
                    className="w-24"
                  />
                  <SortableHead
                    field="name"
                    label="Name"
                    sort={sort}
                    dir={dir}
                    onSort={applySort}
                  />
                  <SortableHead
                    field="email"
                    label="Email"
                    sort={sort}
                    dir={dir}
                    onSort={applySort}
                  />
                  <SortableHead
                    field="access"
                    label="Role"
                    sort={sort}
                    dir={dir}
                    onSort={applySort}
                  />
                  <SortableHead
                    field="soldItems"
                    label="Sold items"
                    sort={sort}
                    dir={dir}
                    onSort={applySort}
                    numeric
                    className="text-right"
                  />
                  <SortableHead
                    field="subscription"
                    label="Active subscription"
                    sort={sort}
                    dir={dir}
                    onSort={applySort}
                  />
                  <SortableHead
                    field="createdAt"
                    label="Registered"
                    sort={sort}
                    dir={dir}
                    onSort={applySort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.users.map((row) => (
                  <TableRow
                    key={row.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => openRow(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openRow(row.id);
                      }
                    }}
                  >
                    <TableCell className="tabular-nums text-muted-foreground">
                      {row.id}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {row.name || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.email || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.access === 100 ? "default" : "secondary"}>
                        {accessRoleLabel(row.access)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.soldItemsCount}
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal text-sm">
                      {row.activeSubscription ? (
                        <span className="text-foreground">{row.activeSubscription}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatAdminDate(row.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || busy}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || busy}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      ) : null}

      <AdminUserDrawer
        userId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onUserUpdated={onUserUpdated}
        onUserDeleted={onUserDeleted}
      />
    </div>
  );
}
