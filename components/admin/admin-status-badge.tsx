import { cn } from "@/lib/utils";

export type AdminModerationTone =
  | "wait_approve"
  | "soft_reject"
  | "hard_reject"
  | "blocked"
  | "published"
  | "processing"
  | "closed"
  | "awaiting"
  | "expect_resolve"
  | "neutral";

const toneClass: Record<AdminModerationTone, string> = {
  wait_approve:
    "border-blue-500/35 bg-blue-500/15 text-blue-200 dark:text-blue-100",
  soft_reject:
    "border-amber-500/40 bg-amber-500/15 text-amber-100 dark:text-amber-50",
  hard_reject: "border-red-500/45 bg-red-500/15 text-red-100 dark:text-red-50",
  blocked: "border-rose-950/80 bg-rose-950/50 text-rose-50",
  published:
    "border-emerald-500/40 bg-emerald-500/15 text-emerald-100 dark:text-emerald-50",
  processing: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
  closed: "border-border bg-muted/50 text-muted-foreground",
  awaiting: "border-orange-500/40 bg-orange-500/15 text-orange-100",
  expect_resolve: "border-sky-500/40 bg-sky-500/15 text-sky-100",
  neutral: "border-border bg-muted/30 text-foreground",
};

export function AdminStatusBadge({
  label,
  tone,
  className,
}: {
  label: string;
  tone: AdminModerationTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Map marketplace `access` + optional approval_requires.status to badge props. */
export function moderationBadgeFromRow(access: number, approvalStatus: string | null): {
  label: string;
  tone: AdminModerationTone;
} {
  if (access === 1) return { label: "Published", tone: "published" };
  if (access === -10) return { label: "Processing", tone: "processing" };
  if (access === 0) {
    if (approvalStatus === "soft_reject") return { label: "Soft reject", tone: "soft_reject" };
    if (approvalStatus === "check") return { label: "Pending review", tone: "wait_approve" };
    return { label: "Wait approve", tone: "wait_approve" };
  }
  if (access === -1) {
    if (approvalStatus === "rejected") return { label: "Hard reject", tone: "hard_reject" };
    if (approvalStatus === "blocked") return { label: "Blocked", tone: "blocked" };
    return { label: "Blocked", tone: "blocked" };
  }
  return { label: `Access ${access}`, tone: "neutral" };
}
