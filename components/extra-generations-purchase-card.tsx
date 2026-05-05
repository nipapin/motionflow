import { Sparkles } from "lucide-react";

export interface ExtraGenerationsPurchaseCardProps {
  generations: number;
  createdAt: string | null;
  paddleTransactionId: string;
}

function formatPurchaseDate(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function ExtraGenerationsPurchaseCard({
  generations,
  createdAt,
  paddleTransactionId,
}: ExtraGenerationsPurchaseCardProps) {
  const title = `Motionflow — ${generations} extra AI generations`;

  return (
    <article className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-stretch lg:gap-6">
        <div className="flex h-32 w-full shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-inset ring-border/40 sm:h-36 lg:h-auto lg:w-40 lg:min-h-36">
          <Sparkles className="size-10 text-muted-foreground" aria-hidden />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-base font-semibold leading-snug tracking-tight sm:text-[17px]">{title}</h2>
          <p className="text-[13px] text-muted-foreground">
            One-time add-on for Creator + AI — credits never expire
          </p>
          <p className="text-sm text-muted-foreground">
            Purchased on {formatPurchaseDate(createdAt)}
            <span className="mx-1.5 text-border">·</span>
            <span className="font-mono text-[0.8125rem]">{paddleTransactionId}</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-col justify-center border-t border-border/50 pt-4 lg:border-t-0 lg:border-l lg:border-border/50 lg:pl-6 lg:pt-0">
          <a
            href="https://login.paddle.com/login"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-border/80 bg-background px-4 py-2 text-[13px] font-medium text-muted-foreground shadow-xs transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            Receipts (Paddle)
          </a>
        </div>
      </div>
    </article>
  );
}
