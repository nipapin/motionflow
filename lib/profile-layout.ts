/** Shared width/padding for profile header and page body. */
export const PROFILE_PAGE_CLASS = "mx-auto w-full max-w-7xl px-6";

/** Full-bleed width for Packages admin tables. */
export const PROFILE_PAGE_CLASS_WIDE =
  "mx-auto w-full max-w-none px-4 sm:px-6 lg:px-8";

/** Packages / Extensions admin need the wide shell; other account pages stay constrained. */
export function profilePageClassForPath(pathname: string | null | undefined): string {
  if (
    pathname?.startsWith("/profile/packages") ||
    pathname?.startsWith("/profile/extensions")
  ) {
    return PROFILE_PAGE_CLASS_WIDE;
  }
  return PROFILE_PAGE_CLASS;
}
