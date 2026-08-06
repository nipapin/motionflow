/**
 * Client-safe author registry (no server-only imports).
 * Keep in sync with `lib/packages-admin.ts` PACKAGES_AUTHORS ids/slugs.
 */
export type PackagesAuthorSlug = "premiere-gal" | "spunkram";

export type PackagesAuthorPublic = {
  id: number;
  slug: PackagesAuthorSlug;
  label: string;
};

export const PACKAGES_AUTHORS: PackagesAuthorPublic[] = [
  { id: 4141, slug: "premiere-gal", label: "Premiere Gal" },
  { id: 1691, slug: "spunkram", label: "Spunkram" },
];

export function getPackagesAuthorPublicById(
  id: number,
): PackagesAuthorPublic | null {
  return PACKAGES_AUTHORS.find((a) => a.id === id) ?? null;
}
