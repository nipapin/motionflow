/**
 * Client-safe author registry (no server-only imports).
 * Keep in sync with `lib/packages-admin.ts` PACKAGES_AUTHORS ids/slugs.
 */
export type PackagesAuthorSlug = "premiere-gal" | "spunkram";

export type PackagesAuthorPublic = {
  id: number;
  slug: PackagesAuthorSlug;
  label: string;
  /** Static logo used as project thumbnail fallback when preview is missing/broken. */
  logoUrl: string;
};

export const PACKAGES_AUTHORS: PackagesAuthorPublic[] = [
  {
    id: 4141,
    slug: "premiere-gal",
    label: "Premiere Gal",
    logoUrl: "/premiere-gal/assets/logo.png",
  },
  {
    id: 1691,
    slug: "spunkram",
    label: "Spunkram",
    logoUrl: "/assets/spunkram.svg",
  },
];

export function getPackagesAuthorPublicById(
  id: number,
): PackagesAuthorPublic | null {
  return PACKAGES_AUTHORS.find((a) => a.id === id) ?? null;
}
