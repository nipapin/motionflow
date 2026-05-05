import type { ComponentType, ReactNode } from "react";
import {
  CircleCheck,
  Sparkles,
  Mail,
  Key,
  Calendar,
  Infinity as InfinityIcon,
} from "lucide-react";
import type { SubscriptionListItem } from "@/lib/subscriptions";
import { SubscriptionTokenCopy } from "@/components/subscription-token-copy";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SubscriptionCardProps {
  item: SubscriptionListItem;
  userEmail: string;
}

function StatusBadge({ item }: { item: SubscriptionListItem }) {
  if (!item.active) {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-medium normal-case text-destructive"
      >
        Disabled
      </Badge>
    );
  }
  if (item.cancelled) {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-amber-500/35 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium normal-case text-amber-800 dark:text-amber-200"
      >
        Cancelled
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="rounded-full border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium normal-case text-emerald-800 dark:text-emerald-300"
    >
      <CircleCheck className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
      Active
    </Badge>
  );
}

function DetailRow({
  icon: Icon,
  label,
  iconVariant = "gray",
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  iconVariant?: "lavender" | "gray";
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/50 py-3 first:border-t-0">
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            iconVariant === "lavender"
              ? "bg-muted text-muted-foreground dark:bg-muted/80"
              : "bg-muted/80 text-muted-foreground",
          )}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
        </span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="min-w-0 flex-1 text-right text-[0.9375rem] font-medium text-foreground">
        {children}
      </div>
    </div>
  );
}

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function SubscriptionCard({ item, userEmail }: SubscriptionCardProps) {
  const planLabel = item.plan ? item.plan.toUpperCase() : "—";
  const isLifetime = item.plan?.toLowerCase().trim() === "lifetime";
  const validUntil = item.endDate ?? (item.endsAt ? formatDate(item.endsAt) : "—");

  return (
    <article className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1px_1fr]">
        {/* ── Summary (left / top) ── */}
        <div className="flex flex-col items-center justify-center border-b border-border/50 p-5 text-center sm:p-7 lg:border-b-0 lg:p-8">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-xl bg-muted/60 ring-1 ring-border/40">
            {item.icon ? (
              <img
                src={item.icon}
                alt={item.subsFor}
                width={40}
                height={40}
                className={`h-10 w-10 object-contain${item.invertIcon ? " dark:invert" : ""}`}
              />
            ) : (
              <Sparkles className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <h3 className="mb-4 max-w-full wrap-break-word text-base font-semibold leading-snug tracking-tight">
            <a
              href={item.productPage}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-border/80 underline-offset-4 transition-colors hover:decoration-foreground/50"
            >
              {item.subsFor}
            </a>
          </h3>
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[13px] text-muted-foreground">
            <span className="text-muted-foreground/90">Status</span>
            <StatusBadge item={item} />
          </p>
        </div>

        {/* Vertical divider (lg only) */}
        <div className="hidden bg-border/60 lg:block" role="presentation" />

        {/* ── Detail rows (right / bottom) ── */}
        <div className="p-4 sm:p-5 lg:py-8 lg:pl-9 lg:pr-8">
          <DetailRow icon={Sparkles} label="Plan" iconVariant="lavender">
            <Badge variant="secondary" className="rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide">
              {planLabel}
            </Badge>
          </DetailRow>

          <DetailRow icon={Mail} label="Email">
            <span className="break-all leading-snug">{userEmail}</span>
          </DetailRow>

          <DetailRow icon={Key} label="Token">
            <SubscriptionTokenCopy subscriptionId={item.subscriptionId} />
          </DetailRow>

          {isLifetime ? (
            <DetailRow icon={InfinityIcon} label="Access" iconVariant="lavender">
              <Badge variant="outline" className="rounded-full border-border/70 bg-muted/40 px-3 py-0.5 text-[11px] font-medium normal-case">
                Forever
              </Badge>
            </DetailRow>
          ) : (
            <DetailRow icon={Calendar} label="Valid until">
              <span className="break-all leading-snug">{validUntil}</span>
            </DetailRow>
          )}

          <div className="mt-4 flex justify-stretch md:justify-end">
            <a
              href="https://login.paddle.com/login"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center rounded-lg border border-border/80 bg-background px-4 py-2 text-[13px] font-medium text-muted-foreground shadow-xs transition-colors hover:bg-muted/50 hover:text-foreground md:w-auto"
            >
              Manage subscription
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
