"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

export type CommandSearchResult = {
  items: { id: number; name: string }[];
  users: { id: number; name: string; email: string }[];
  requests: { id: number; type: string }[];
};

export function AdminCommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<CommandSearchResult | null>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setData(null);
      return;
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || query.trim().length < 2) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      (async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/admin/command-search?q=${encodeURIComponent(query.trim())}`, {
            credentials: "same-origin",
          });
          if (!res.ok) throw new Error("search failed");
          const json = (await res.json()) as CommandSearchResult;
          if (!cancelled) setData(json);
        } catch {
          if (!cancelled) setData({ items: [], users: [], requests: [] });
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, query]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Admin search" description="Find items, users, or requests">
      <CommandInput placeholder="Type at least 2 characters…" value={query} onValueChange={setQuery} />
      <CommandList>
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
        ) : query.trim().length < 2 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Enter 2+ characters to search the database.</div>
        ) : (
          <>
            <CommandEmpty>No results.</CommandEmpty>
            {data?.items.length ? (
              <CommandGroup heading="Items">
                {data.items.map((it) => (
                  <CommandItem
                    key={`i-${it.id}`}
                    value={`item-${it.id}-${it.name}`}
                    onSelect={() => {
                      onOpenChange(false);
                      router.push(`/adminzone/items_access/wait?focus=${it.id}`);
                    }}
                  >
                    #{it.id} — {it.name}
                    <CommandShortcut>Open</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {data?.users.length ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Users">
                  {data.users.map((u) => (
                    <CommandItem
                      key={`u-${u.id}`}
                      value={`user-${u.id}-${u.name}`}
                      onSelect={() => {
                        onOpenChange(false);
                        router.push(`/adminzone/search?user=${u.id}`);
                      }}
                    >
                      {u.name} <span className="text-muted-foreground">({u.email})</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
            {data?.requests.length ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Requests">
                  {data.requests.map((r) => (
                    <CommandItem
                      key={`r-${r.id}`}
                      value={`req-${r.id}-${r.type}`}
                      onSelect={() => {
                        onOpenChange(false);
                        router.push(`/adminzone/requests/view?id=${r.id}`);
                      }}
                    >
                      #{r.id} — {r.type.replace(/_/g, " ")}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
