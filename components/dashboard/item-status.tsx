import { cn } from "@/lib/utils";

function statusDotClass(access: number): string {
  if (access === 1) return "bg-emerald-400/90 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]";
  if (access === -10) return "bg-sky-400/85";
  if (access === 0) return "bg-amber-400/85";
  if (access === -1) return "bg-red-400/90";
  return "bg-muted-foreground/60";
}

interface ItemStatusProps {
  access: number;
  label: string;
  className?: string;
}

/** Dot + label — readable without loud Badge chrome (label from server source of truth). */
export function ItemStatus({ access, label, className }: ItemStatusProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", statusDotClass(access))} aria-hidden />
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
    </span>
  );
}
