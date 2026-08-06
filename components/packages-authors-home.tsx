"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { PACKAGES_AUTHORS } from "@/lib/packages-admin-client";

export function PackagesAuthorsHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Package className="h-6 w-6 text-blue-400" />
          Packages
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose an author to manage projects (meta in DB, files on R2).
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PACKAGES_AUTHORS.map((a) => (
          <Link
            key={a.id}
            href={`/profile/packages/${a.id}`}
            className="rounded-xl border border-blue-500/20 bg-card/40 p-5 hover:border-blue-500/50 hover:bg-blue-500/5 transition"
          >
            <p className="font-semibold text-foreground">{a.label}</p>
            <p className="text-xs text-muted-foreground mt-1">
              author_id {a.id} · {a.slug}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
