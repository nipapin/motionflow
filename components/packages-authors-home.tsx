"use client";

import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";
import { PACKAGES_AUTHORS } from "@/lib/packages-admin-client";

export function PackagesAuthorsHome() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-muted-foreground mb-2">Home · Packages</p>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Package className="h-6 w-6 text-blue-400" />
          Packages
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose an author to manage package instances (meta in DB, files on R2).
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PACKAGES_AUTHORS.map((a) => (
          <Link
            key={a.id}
            href={`/profile/packages/${a.id}`}
            className="group flex items-center gap-4 rounded-xl border border-border/80 bg-card/40 p-5 hover:border-blue-500/40 hover:bg-blue-500/5 transition"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.logoUrl}
              alt=""
              className="h-12 w-12 rounded-lg object-contain bg-muted/40 p-1.5 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground group-hover:text-blue-400 transition-colors">
                {a.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                author_id {a.id} · {a.slug}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-400 shrink-0 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
