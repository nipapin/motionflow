"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { projects as fallbackProjects, plans, type Project, type ProjectApp } from "@/lib/data";
import { cn } from "@/lib/cn";

function AppIcon({ app }: { app: ProjectApp }) {
  const isPr = app === "Premiere Pro";
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold leading-none tracking-tight text-white",
        "bg-[#473BBD]"
      )}
      aria-hidden="true"
    >
      {isPr ? "Pr" : "Ae"}
    </span>
  );
}

const filters = [
  { id: "all", label: "All" },
  { id: "Premiere Pro" as ProjectApp, label: "Premiere Pro" },
  { id: "After Effects" as ProjectApp, label: "After Effects" },
] as const;

function ProjectCard({ project }: { project: Project }) {
  const titleBlock = (
    <div className="min-w-0">
      <h3 className="text-base font-semibold text-foreground leading-none">
        {project.title}
      </h3>
      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <AppIcon app={project.app} />
        <span className="text-[11px] font-medium text-muted tracking-wide">
          {project.app}
        </span>
      </div>
    </div>
  );

  const coverBlock = (
    <div className="relative aspect-video w-full overflow-hidden bg-surface-2">
      <Image
        src={project.coverImage}
        alt={project.title}
        fill
        className="object-cover"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      />
      <div className="absolute top-3 right-3 z-10">
        <span
          title="Included in subscription"
          className="inline-flex items-center gap-1 text-[10px] font-medium bg-brand-violet-soft backdrop-blur px-2 py-1 rounded-md text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.2)]"
        >
          <svg
            className="w-3 h-3"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 10l4 4 8-8" />
          </svg>
          In subscription
        </span>
      </div>
    </div>
  );

  return (
    <article className="card card-hover rounded-2xl overflow-hidden flex flex-col">
      {project.href ? (
        <Link href={project.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/80">
          {coverBlock}
        </Link>
      ) : (
        coverBlock
      )}

      <div className="p-5 flex-1">
        <div className="flex items-center justify-between gap-3">
          {project.href ? (
            <Link
              href={project.href}
              className="min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/80"
            >
              {titleBlock}
            </Link>
          ) : (
            titleBlock
          )}

          <div className="relative flex min-w-[5.5rem] shrink-0 items-center justify-end group/cart self-center">
            <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground transition-opacity duration-200 group-hover/cart:opacity-0 group-hover/cart:invisible group-focus-within/cart:opacity-0 group-focus-within/cart:invisible">
              ${project.price}
            </span>
            <button
              type="button"
              aria-label={`Add ${project.title} to cart for ${project.price} dollars`}
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg bg-brand-violet text-white opacity-0 invisible transition-all duration-200 hover:bg-brand-violet-hover group-hover/cart:opacity-100 group-hover/cart:visible group-focus-within/cart:opacity-100 group-focus-within/cart:visible shadow-[0_1px_3px_rgb(0_0_0/0.12),inset_0_1px_0_0_rgb(255_255_255/0.22)]"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function SubscriptionBanner() {
  const yearly = plans.find((p) => p.id === "yearly")!;
  const monthlyEquivalent = (yearly.price / 12).toFixed(1);

  return (
    <div className="card relative overflow-hidden rounded-2xl !border-2 !border-brand-500">
      <div
        className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
        aria-hidden="true"
      />
      <div className="relative z-[1] flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-violet text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.25)]"
            aria-hidden="true"
          >
            <svg
              className="h-5 w-5"
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2-2.67 4-4 6-4a4 4 0 1 1 0 8c-2 0-4-1.33-6-4Z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground sm:text-lg">
              All projects in one subscription
            </h3>
            <p className="mt-1 text-sm text-muted">
              Instant access to the entire library · new packs added monthly ·
              cancel anytime.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 md:shrink-0">
          <div className="text-right">
            <div className="text-[11px] text-subtle">from</div>
            <div className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
              ${monthlyEquivalent}
              <span className="text-sm font-medium text-muted">/mo</span>
            </div>
          </div>
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-white/10 border-l-0 bg-brand-violet px-4 py-2.5 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22),0_10px_32px_-18px_rgb(110_60_255/0.55)] transition-[background-image,box-shadow] duration-200 hover:bg-brand-violet-hover hover:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.26),0_12px_36px_-18px_rgb(110_60_255/0.6)] light:border-black/10 light:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.2),0_10px_32px_-18px_rgb(110_60_255/0.35)] light:hover:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.24),0_12px_36px_-18px_rgb(110_60_255/0.42)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Subscribe
            <svg
              className="h-4 w-4 shrink-0 opacity-90"
              width={16}
              height={16}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

export function Projects({ projects = fallbackProjects }: { projects?: Project[] }) {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return projects;
    return projects.filter((p) => p.app === filter);
  }, [filter]);

  return (
    <section id="projects" className="relative pt-12 pb-20">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
              Projects
            </h2>
            <p className="mt-2 text-muted">
              Buy individually — yours forever. Or{" "}
              <a
                href="#pricing"
                className="text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-foreground"
              >
                unlock every project
              </a>{" "}
              with a subscription.
            </p>
          </div>

          <div className="relative z-[2] inline-flex items-center gap-0.5 self-start rounded-lg p-0.5 card md:self-end pointer-events-auto">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  filter === f.id
                    ? "bg-brand-violet-soft text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22)]"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <SubscriptionBanner />
        </div>

        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
