"use client";
import { useId, useState } from "react";
import { CalendarIcon, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function UserCsvExport({ endpoint, params, disabled }: {
  endpoint: string; params: URLSearchParams; disabled?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function download(format: "csv" | "mailgun") {
    setBusy(format);
    setError(null);
    try {
      const query = new URLSearchParams(params);
      query.delete("page");
      query.set("export", format);
      const response = await fetch(`${endpoint}?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || body.error || "Export failed. Try again.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `users-${format}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed. Try again.");
    } finally { setBusy(null); }
  }
  return <div className="space-y-1">
    <div className="flex flex-wrap gap-2">
      {(["csv", "mailgun"] as const).map(format => <Button key={format} type="button" size="sm" variant="outline" disabled={disabled || busy !== null} onClick={() => void download(format)} title="Download all users matching the current filters across every page">
        {busy === format ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        {format === "mailgun" ? "Mailgun CSV" : "Download CSV"}
      </Button>)}
    </div>
    <p className="text-[11px] text-muted-foreground">All filtered users · Mailgun: unique addresses</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

function parseYmd(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DateFilter({
  id,
  label,
  value,
  min,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseYmd(value);
  const minDate = min ? parseYmd(min) : undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "w-40 justify-start font-normal dark:bg-input/30 dark:hover:bg-input/50",
              !selected && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            <span className="truncate">
              {selected
                ? selected.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "Any date"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto border-border bg-popover p-0"
        >
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? minDate ?? new Date()}
            disabled={minDate ? { before: minDate } : undefined}
            onSelect={(date) => {
              onChange(date ? toYmd(date) : "");
              setOpen(false);
            }}
          />
          {value ? (
            <div className="border-t border-border/60 p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
