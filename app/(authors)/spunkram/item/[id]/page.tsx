import Link from "next/link";
import { notFound } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  FileArchive,
  Layers,
  Monitor,
  Music2,
  Puzzle,
  RefreshCw,
  ScanText,
} from "lucide-react";
import { getMarketItemsByIds } from "@/lib/market-items";
import { productThumbnailUrl } from "@/lib/product-ui";
import { ItemCheckoutCard } from "@/app/(authors)/spunkram/item/[id]/item-checkout-card";

const SPUNKRAM_AUTHOR_ID = 1691;

type SpunkramHostApp = "premiere-pro" | "after-effects" | "davinci-resolve";

type ItemDetail =
  | { label: string; value: string; variant: "lucide"; icon: LucideIcon }
  | { label: string; value: string; variant: "host"; host: SpunkramHostApp };

function HostAppMark({ host }: { host: SpunkramHostApp }) {
  const abbr =
    host === "premiere-pro" ? "Pr" : host === "after-effects" ? "Ae" : "Dr";

  return (
    <span
      className="shrink-0 text-xs font-semibold leading-none tracking-tight text-[rgb(var(--muted))]"
      aria-hidden="true"
    >
      {abbr}
    </span>
  );
}

function stripScripts(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

function toSafeHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return stripScripts(trimmed);
}

function readAttribute(
  attributes: Record<string, string>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const exact = attributes[key];
    if (exact != null && String(exact).trim()) return String(exact).trim();
  }

  const normalizedMap = new Map<string, string>();
  for (const [k, v] of Object.entries(attributes)) {
    if (!String(v).trim()) continue;
    normalizedMap.set(k.toLowerCase().replace(/[\s_-]+/g, ""), String(v).trim());
  }
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[\s_-]+/g, "");
    const hit = normalizedMap.get(normalizedKey);
    if (hit) return hit;
  }
  return null;
}

function toYesNo(value: string | null, fallback = "—"): string {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "yes" || normalized === "true") return "Yes";
  if (normalized === "0" || normalized === "no" || normalized === "false") return "No";
  return fallback;
}

export default async function SpunkramItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) notFound();

  const [item] = await getMarketItemsByIds([itemId]);
  if (!item || item.author_id !== SPUNKRAM_AUTHOR_ID || item.access !== 1) notFound();

  const html = toSafeHtml(item.description_html || item.description);
  const tags = item.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
  const previewImage = productThumbnailUrl(item) || "/project-cover.png";
  const indexCategory = (item.index_category_slug ?? "").toLowerCase();
  const details: ItemDetail[] = (() => {
    if (indexCategory === "after-effects") {
      return [
        {
          label: "Software version",
          value: readAttribute(item.attributes, "ae_version") ?? "—",
          variant: "host",
          host: "after-effects",
        },
        {
          label: "Required plugins",
          value: readAttribute(item.attributes, "req_plugins") ?? "No",
          variant: "lucide",
          icon: Puzzle,
        },
        {
          label: "Universal expressions",
          value: toYesNo(readAttribute(item.attributes, "universal_expr"), "No"),
          variant: "lucide",
          icon: ScanText,
        },
        {
          label: "Resolution",
          value: readAttribute(item.attributes, "resolution") ?? "—",
          variant: "lucide",
          icon: Monitor,
        },
        {
          label: "Associated music",
          value: readAttribute(item.attributes, "assoc_music") ?? "No",
          variant: "lucide",
          icon: Music2,
        },
        {
          label: "File size",
          value: readAttribute(item.attributes, "file_size") ?? "—",
          variant: "lucide",
          icon: FileArchive,
        },
        {
          label: "Current version",
          value: readAttribute(item.attributes, "current_version") ?? "—",
          variant: "lucide",
          icon: RefreshCw,
        },
      ];
    }

    if (indexCategory === "davinci-resolve") {
      return [
        {
          label: "Software version",
          value: readAttribute(item.attributes, "davinci_version") ?? "—",
          variant: "host",
          host: "davinci-resolve",
        },
        {
          label: "Resolution",
          value: readAttribute(item.attributes, "resolution") ?? "—",
          variant: "lucide",
          icon: Monitor,
        },
        {
          label: "Associated music",
          value: readAttribute(item.attributes, "assoc_music") ?? "No",
          variant: "lucide",
          icon: Music2,
        },
        {
          label: "File size",
          value: readAttribute(item.attributes, "file_size") ?? "—",
          variant: "lucide",
          icon: FileArchive,
        },
        {
          label: "Current version",
          value: readAttribute(item.attributes, "current_version") ?? "—",
          variant: "lucide",
          icon: RefreshCw,
        },
      ];
    }

    return [
      {
        label: "Software version",
        value: readAttribute(item.attributes, "pr_version") ?? "—",
        variant: "host",
        host: "premiere-pro",
      },
      {
        label: "MOGRT",
        value: toYesNo(readAttribute(item.attributes, "with_mogrt"), "No"),
        variant: "lucide",
        icon: Layers,
      },
      {
        label: "Resolution",
        value: readAttribute(item.attributes, "resolution") ?? "—",
        variant: "lucide",
        icon: Monitor,
      },
      {
        label: "Associated music",
        value: readAttribute(item.attributes, "assoc_music") ?? "No",
        variant: "lucide",
        icon: Music2,
      },
      {
        label: "File size",
        value: readAttribute(item.attributes, "file_size") ?? "—",
        variant: "lucide",
        icon: FileArchive,
      },
      {
        label: "Current version",
        value: readAttribute(item.attributes, "current_version") ?? "—",
        variant: "lucide",
        icon: RefreshCw,
      },
    ];
  })();
  const showSubscriptionPromo =
    indexCategory === "premiere-pro" || indexCategory === "after-effects";

  return (
    <main className="relative z-1 mx-auto max-w-7xl px-5 pb-20 pt-4 sm:px-8">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
        >
          <span aria-hidden="true">←</span>
          Back to projects
        </Link>
      </div>

      <article className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="space-y-4">
          <section className="card rounded-2xl p-5 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              {item.name}
            </h1>
          </section>

          <section className="card overflow-hidden rounded-2xl">
            <div className="p-3 sm:p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImage}
                alt={item.name}
                className="h-auto w-full rounded-xl object-cover"
              />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <aside className="card rounded-2xl p-5 sm:p-6">
            <ItemCheckoutCard
              itemId={item.id}
              itemName={item.name}
              basePrice={item.price}
              jsonArgs={item.json_args}
            />

            <dl className="mt-4 space-y-2 text-sm">
              {details.map((detail) => (
                <div key={detail.label} className="flex items-start justify-between gap-4">
                  <dt className="inline-flex items-center gap-2 text-muted">
                    {detail.variant === "host" ? (
                      <HostAppMark host={detail.host} />
                    ) : (
                      <detail.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <span>{detail.label}</span>
                  </dt>
                  <dd className="text-right text-foreground">{detail.value}</dd>
                </div>
              ))}
            </dl>

            {!showSubscriptionPromo && tags.length > 0 ? (
              <div className="mt-5 border-t border-white/10 pt-4">
                <div className="text-xs uppercase tracking-wide text-muted">Tags</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          {showSubscriptionPromo ? (
            <section className="card rounded-2xl border border-brand-500/30 bg-[linear-gradient(180deg,rgba(110,60,255,0.16),rgba(110,60,255,0.06))] px-4 py-4 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.12)]">
              <h3 className="text-base font-semibold leading-snug text-white sm:text-lg">
                Get all projects from $15.9/mo.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Get access to all items in one convenient subscription.
              </p>
              <div className="mt-4 border-t border-white/12 pt-4">
                <Link
                  href="/#pricing"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-violet px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_-16px_rgb(110_60_255/0.92)] transition-all hover:bg-brand-violet-hover"
                >
                  Unlock all projects
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </section>
          ) : null}
        </div>
      </article>

      {html ? (
        <section className="card mt-6 rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-foreground">Description</h2>
          <div
            className="mx-auto mt-6 w-full max-w-4xl text-[15px] leading-7 text-foreground/90
              [&>*+*]:mt-5
              [&_h1]:mt-8 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-foreground
              [&_h2]:mt-7 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-foreground
              [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-foreground
              [&_p]:text-[15px] [&_p]:leading-7
              [&_a]:text-brand-300 [&_a]:underline [&_a]:underline-offset-4
              [&_strong]:font-semibold [&_strong]:text-foreground
              [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6
              [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6
              [&_img]:mx-auto [&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl
              [&_blockquote]:border-l-2 [&_blockquote]:border-brand-500/50 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted
              [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-white/10 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold
              [&_td]:border [&_td]:border-white/10 [&_td]:px-3 [&_td]:py-2"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </section>
      ) : null}
    </main>
  );
}
