/**
 * Client-safe author logos / seed ids (no server-only imports).
 * Labels may lag DB; prefer `/api/packages/authors` when live data is needed.
 */
export type PackagesAuthorSlug = "premiere-gal" | "spunkram" | string;

export type PackagesAuthorPublic = {
  id: number;
  slug: PackagesAuthorSlug;
  label: string;
  /** Static logo used as project thumbnail fallback when preview is missing/broken. */
  logoUrl: string;
};

const LOGO_BY_SLUG: Record<string, string> = {
  "premiere-gal": "/premiere-gal/assets/logo.png",
  spunkram: "/assets/spunkram.svg",
};

export const PACKAGES_AUTHORS: PackagesAuthorPublic[] = [
  {
    id: 4141,
    slug: "premiere-gal",
    label: "Premiere Gal",
    logoUrl: LOGO_BY_SLUG["premiere-gal"],
  },
  {
    id: 1691,
    slug: "spunkram",
    label: "Spunkram",
    logoUrl: LOGO_BY_SLUG.spunkram,
  },
];

export function packagesAuthorLogoUrl(
  slugOrId: string | number,
): string {
  if (typeof slugOrId === "number") {
    const known = PACKAGES_AUTHORS.find((a) => a.id === slugOrId);
    if (known) return known.logoUrl;
    return "/assets/spunkram.svg";
  }
  return LOGO_BY_SLUG[slugOrId] || "/assets/spunkram.svg";
}

export function getPackagesAuthorPublicById(
  id: number,
): PackagesAuthorPublic | null {
  return PACKAGES_AUTHORS.find((a) => a.id === id) ?? null;
}

export function toPackagesAuthorPublic(opts: {
  id: number;
  slug: string;
  label: string;
}): PackagesAuthorPublic {
  return {
    id: opts.id,
    slug: opts.slug,
    label: opts.label,
    logoUrl: packagesAuthorLogoUrl(opts.slug) !== "/assets/spunkram.svg"
      ? packagesAuthorLogoUrl(opts.slug)
      : packagesAuthorLogoUrl(opts.id),
  };
}
