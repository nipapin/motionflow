"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Radix rejects an empty item value; this is not a valid R2 bucket name. */
const UNSET_BUCKET = "__unset__";

export function R2BucketSelect({
  id,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <Select
      value={value || UNSET_BUCKET}
      onValueChange={(next) => onChange(next === UNSET_BUCKET ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="h-9! w-full font-mono">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value={UNSET_BUCKET} className="text-muted-foreground">
          — Not set —
        </SelectItem>
        {options.map((bucket) => (
          <SelectItem key={bucket} value={bucket} className="font-mono">
            {bucket}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
