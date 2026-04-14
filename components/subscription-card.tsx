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

interface SubscriptionCardProps {
  item: SubscriptionListItem;
  userEmail: string;
}

function StatusBadge({ item }: { item: SubscriptionListItem }) {
  if (!item.active) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-[0.8125rem] font-medium text-white">
        disabled
      </span>
    );
  }
  if (item.cancelled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-[0.8125rem] font-medium text-white">
        cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1 text-[0.8125rem] font-medium text-white">
      <CircleCheck className="h-3.5 w-3.5 shrink-0" />
      active
    </span>
  );
}

function DetailRow({
  icon: Icon,
  label,
  iconVariant = "gray",
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconVariant?: "lavender" | "gray";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/40 py-3 first:border-t-0">
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
            iconVariant === "lavender"
              ? "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400"
              : "bg-muted text-muted-foreground"
          }`}
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
    <article className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1px_1fr]">
        {/* ── Summary (left / top) ── */}
        <div className="flex flex-col items-center justify-center border-b border-border/40 p-5 text-center sm:p-7 lg:border-b-0 lg:p-8">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
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
          <h3 className="mb-4 max-w-full wrap-break-word text-lg font-medium leading-snug">
            <a
              href={item.productPage}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 smooth hover:decoration-foreground/40"
            >
              {item.subsFor}
            </a>
          </h3>
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[0.95rem] text-muted-foreground">
            Your subscription is
            <StatusBadge item={item} />
          </p>
        </div>

        {/* Vertical divider (lg only) */}
        <div className="hidden bg-border/40 lg:block" role="presentation" />

        {/* ── Detail rows (right / bottom) ── */}
        <div className="p-4 sm:p-5 lg:py-8 lg:pl-9 lg:pr-8">
          <DetailRow icon={Sparkles} label="Plan" iconVariant="lavender">
            <span className="inline-block rounded-full bg-violet-600 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wider text-white">
              {planLabel}
            </span>
          </DetailRow>

          <DetailRow icon={Mail} label="Email">
            <span className="break-all leading-snug">{userEmail}</span>
          </DetailRow>

          <DetailRow icon={Key} label="Token">
            <SubscriptionTokenCopy subscriptionId={item.subscriptionId} />
          </DetailRow>

          {isLifetime ? (
            <DetailRow icon={InfinityIcon} label="Access" iconVariant="lavender">
              <span className="inline-flex items-center justify-center rounded-full border border-violet-200 bg-linear-to-br from-violet-50 via-violet-100/60 to-fuchsia-50 px-4 py-1.5 text-[0.8125rem] font-semibold uppercase tracking-wider text-violet-700 dark:border-violet-500/30 dark:from-violet-500/10 dark:via-violet-500/5 dark:to-fuchsia-500/10 dark:text-violet-300">
                Forever
              </span>
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
              className="inline-flex w-full items-center justify-center rounded-[10px] border border-border px-5 py-2.5 text-sm font-semibold text-muted-foreground smooth hover:border-muted-foreground/40 hover:bg-muted/60 hover:text-foreground md:w-auto"
            >
              Manage Subscription
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
