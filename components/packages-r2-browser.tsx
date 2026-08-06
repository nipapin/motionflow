"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Columns3,
  Copy,
  File,
  Folder,
  LayoutGrid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type R2BrowserObject = {
  key: string;
  size: number;
  lastModified: string | null;
  publicUrl: string;
};

type ViewMode = "list" | "grid" | "columns";

type FsEntry = {
  name: string;
  /** Folder path with trailing slash, or full object key for files. */
  path: string;
  kind: "folder" | "file";
  size: number;
  lastModified: string | null;
  publicUrl: string | null;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function commonRootPrefix(keys: string[]): string {
  if (keys.length === 0) return "";
  const parts = keys[0]!.split("/").filter(Boolean);
  let depth = parts.length;
  for (const key of keys.slice(1)) {
    const segs = key.split("/").filter(Boolean);
    let i = 0;
    while (i < depth && i < segs.length && segs[i] === parts[i]) i++;
    depth = i;
    if (depth === 0) return "";
  }
  // If all keys share a full file path (single file), treat parent as root.
  if (keys.every((k) => k.split("/").filter(Boolean).length === depth)) {
    depth = Math.max(0, depth - 1);
  }
  return depth > 0 ? `${parts.slice(0, depth).join("/")}/` : "";
}

function entriesInFolder(objects: R2BrowserObject[], folderPath: string): FsEntry[] {
  const folders = new Map<string, FsEntry>();
  const files: FsEntry[] = [];

  for (const obj of objects) {
    if (folderPath && !obj.key.startsWith(folderPath)) continue;
    const rest = folderPath ? obj.key.slice(folderPath.length) : obj.key;
    if (!rest) continue;
    const slash = rest.indexOf("/");
    if (slash === -1) {
      files.push({
        name: rest,
        path: obj.key,
        kind: "file",
        size: obj.size,
        lastModified: obj.lastModified,
        publicUrl: obj.publicUrl,
      });
      continue;
    }
    const name = rest.slice(0, slash);
    const path = `${folderPath}${name}/`;
    const existing = folders.get(path);
    if (existing) {
      existing.size += obj.size;
      if (
        obj.lastModified &&
        (!existing.lastModified || obj.lastModified > existing.lastModified)
      ) {
        existing.lastModified = obj.lastModified;
      }
    } else {
      folders.set(path, {
        name,
        path,
        kind: "folder",
        size: obj.size,
        lastModified: obj.lastModified,
        publicUrl: null,
      });
    }
  }

  return [
    ...[...folders.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ...files.sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

function breadcrumbParts(root: string, current: string): { label: string; path: string }[] {
  const crumbs: { label: string; path: string }[] = [
    { label: root ? root.replace(/\/$/, "").split("/").pop() || "R2" : "R2", path: root },
  ];
  if (!current.startsWith(root)) return crumbs;
  const rest = current.slice(root.length);
  if (!rest) return crumbs;
  let acc = root;
  for (const seg of rest.split("/").filter(Boolean)) {
    acc = `${acc}${seg}/`;
    crumbs.push({ label: seg, path: acc });
  }
  return crumbs;
}

function parentFolder(root: string, current: string): string {
  if (!current || current === root) return root;
  const segs = current.slice(root.length).split("/").filter(Boolean);
  segs.pop();
  return segs.length ? `${root}${segs.join("/")}/` : root;
}

function EntryIcon({ kind, className }: { kind: "folder" | "file"; className?: string }) {
  if (kind === "folder") {
    return <Folder className={cn("text-amber-400/90", className)} />;
  }
  return <File className={cn("text-blue-400/80", className)} />;
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const items: { id: ViewMode; label: string; icon: typeof List }[] = [
    { id: "grid", label: "Grid", icon: LayoutGrid },
    { id: "list", label: "List", icon: List },
    { id: "columns", label: "Columns", icon: Columns3 },
  ];
  return (
    <div
      className="inline-flex rounded-lg border border-border/60 bg-background/50 p-0.5"
      role="group"
      aria-label="View mode"
    >
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition",
            value === id
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

function FileActions({ entry }: { entry: FsEntry }) {
  if (entry.kind !== "file" || !entry.publicUrl) return null;
  return (
    <button
      type="button"
      className="text-blue-400 hover:underline text-xs shrink-0"
      onClick={(e) => {
        e.stopPropagation();
        void copyText(entry.publicUrl!);
      }}
    >
      <span className="inline-flex items-center gap-1">
        <Copy className="h-3 w-3" />
        copy
      </span>
    </button>
  );
}

export function PackagesR2Browser({ objects }: { objects: R2BrowserObject[] }) {
  const root = useMemo(
    () => commonRootPrefix(objects.map((o) => o.key)),
    [objects],
  );
  const [view, setView] = useState<ViewMode>("list");
  const [currentPath, setCurrentPath] = useState(root);
  /** For columns view: selected path at each depth (absolute folder paths). */
  const [columnSelection, setColumnSelection] = useState<string[]>([root]);

  useEffect(() => {
    setCurrentPath(root);
    setColumnSelection([root]);
  }, [root, objects]);

  useEffect(() => {
    if (view !== "columns") return;
    const next: string[] = [root];
    if (currentPath.startsWith(root)) {
      let acc = root;
      for (const seg of currentPath.slice(root.length).split("/").filter(Boolean)) {
        acc = `${acc}${seg}/`;
        next.push(acc);
      }
    }
    setColumnSelection(next);
  }, [view, root, currentPath]);

  const crumbs = useMemo(
    () => breadcrumbParts(root, currentPath),
    [root, currentPath],
  );

  const listEntries = useMemo(
    () => entriesInFolder(objects, currentPath),
    [objects, currentPath],
  );

  /** Each entry is the folder whose children are shown in that column. */
  const columnPaths = useMemo(() => {
    const paths = columnSelection.length > 0 ? columnSelection : [root];
    return paths[0] === root ? paths : [root];
  }, [columnSelection, root]);

  const syncColumnsToPath = (path: string) => {
    const next: string[] = [root];
    if (path.startsWith(root)) {
      let acc = root;
      for (const seg of path.slice(root.length).split("/").filter(Boolean)) {
        acc = `${acc}${seg}/`;
        next.push(acc);
      }
    }
    setColumnSelection(next);
  };

  const openFolder = (path: string) => {
    setCurrentPath(path);
    syncColumnsToPath(path);
  };

  const selectInColumn = (columnIndex: number, entry: FsEntry) => {
    if (entry.kind === "folder") {
      const newPaths = [...columnPaths.slice(0, columnIndex + 1), entry.path];
      setColumnSelection(newPaths);
      setCurrentPath(entry.path);
      return;
    }
    setColumnSelection(columnPaths.slice(0, columnIndex + 1));
    setCurrentPath(columnPaths[columnIndex] ?? root);
  };

  if (objects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No objects under author prefixes.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav
          className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-xs"
          aria-label="Folder path"
        >
          {crumbs.map((c, i) => (
            <span key={c.path || "root"} className="inline-flex items-center gap-0.5 min-w-0">
              {i > 0 ? (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              ) : null}
              <button
                type="button"
                onClick={() => openFolder(c.path)}
                className={cn(
                  "truncate rounded px-1.5 py-0.5 font-medium transition",
                  c.path === currentPath
                    ? "bg-blue-500/15 text-blue-300"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            </span>
          ))}
        </nav>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === "list" ? (
        <div className="overflow-auto max-h-96 rounded-lg border border-border/40">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm">
              <tr className="text-left text-muted-foreground border-b border-border/50">
                <th className="py-2 px-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Size</th>
                <th className="py-2 pr-3 font-medium">Modified</th>
                <th className="py-2 pr-3 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {currentPath !== root ? (
                <tr className="border-b border-border/30 hover:bg-foreground/3">
                  <td className="py-1.5 px-3" colSpan={4}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
                      onClick={() => openFolder(parentFolder(root, currentPath))}
                    >
                      <Folder className="h-4 w-4 text-amber-400/70" />
                      ..
                    </button>
                  </td>
                </tr>
              ) : null}
              {listEntries.map((entry) => (
                <tr
                  key={entry.path}
                  className="border-b border-border/30 hover:bg-foreground/3"
                >
                  <td className="py-1.5 px-3">
                    {entry.kind === "folder" ? (
                      <button
                        type="button"
                        className="inline-flex max-w-full items-center gap-2 text-left hover:text-blue-300"
                        onClick={() => openFolder(entry.path)}
                      >
                        <EntryIcon kind="folder" className="h-4 w-4 shrink-0" />
                        <span className="truncate font-medium">{entry.name}</span>
                      </button>
                    ) : (
                      <span className="inline-flex max-w-full items-center gap-2">
                        <EntryIcon kind="file" className="h-4 w-4 shrink-0" />
                        <span className="truncate font-medium">{entry.name}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                    {entry.kind === "file" ? formatBytes(entry.size) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                    {entry.lastModified
                      ? new Date(entry.lastModified).toLocaleString()
                      : "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    <FileActions entry={entry} />
                  </td>
                </tr>
              ))}
              {listEntries.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Empty folder
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === "grid" ? (
        <div className="max-h-96 overflow-auto rounded-lg border border-border/40 p-3">
          {currentPath !== root ? (
            <button
              type="button"
              className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => openFolder(parentFolder(root, currentPath))}
            >
              <Folder className="h-3.5 w-3.5 text-amber-400/70" />
              Up one level
            </button>
          ) : null}
          {listEntries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Empty folder</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {listEntries.map((entry) => (
                <div
                  key={entry.path}
                  className={cn(
                    "group flex flex-col items-center gap-2 rounded-xl border border-border/40 bg-background/30 px-2 py-3 text-center transition hover:border-blue-500/40 hover:bg-blue-500/5",
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full flex-col items-center gap-2"
                    onClick={() => {
                      if (entry.kind === "folder") openFolder(entry.path);
                    }}
                    disabled={entry.kind === "file"}
                  >
                    <EntryIcon kind={entry.kind} className="h-9 w-9" />
                    <span className="w-full truncate text-xs font-medium leading-tight">
                      {entry.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {entry.kind === "file" ? formatBytes(entry.size) : "Folder"}
                    </span>
                  </button>
                  {entry.kind === "file" && entry.publicUrl ? (
                    <button
                      type="button"
                      className="text-[10px] text-blue-400 opacity-0 transition group-hover:opacity-100 hover:underline"
                      onClick={() => void copyText(entry.publicUrl!)}
                    >
                      copy link
                    </button>
                  ) : (
                    <span className="h-3" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {view === "columns" ? (
        <div className="flex max-h-96 overflow-x-auto overflow-y-hidden rounded-lg border border-border/40">
          {columnPaths.map((folderPath, colIndex) => {
            const entries = entriesInFolder(objects, folderPath);
            const selectedChild = columnPaths[colIndex + 1] ?? null;
            return (
              <div
                key={`${colIndex}:${folderPath}`}
                className="flex w-52 shrink-0 flex-col border-r border-border/40 last:border-r-0 bg-background/20"
              >
                <div className="shrink-0 truncate border-b border-border/40 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {folderPath === root
                    ? crumbs[0]?.label ?? "Root"
                    : folderPath.replace(/\/$/, "").split("/").pop()}
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                  {entries.length === 0 ? (
                    <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                      Empty
                    </li>
                  ) : (
                    entries.map((entry) => {
                      const selected =
                        entry.kind === "folder" && selectedChild === entry.path;
                      return (
                        <li key={entry.path}>
                          <button
                            type="button"
                            onClick={() => selectInColumn(colIndex, entry)}
                            className={cn(
                              "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition",
                              selected
                                ? "bg-blue-600/25 text-blue-100"
                                : "hover:bg-foreground/5",
                            )}
                          >
                            <EntryIcon kind={entry.kind} className="h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {entry.name}
                            </span>
                            {entry.kind === "folder" ? (
                              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                            ) : (
                              <FileActions entry={entry} />
                            )}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        {objects.length} object{objects.length === 1 ? "" : "s"} · folder structure from
        object keys
      </p>
    </div>
  );
}
