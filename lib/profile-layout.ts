/** Shared width/padding for profile header and page body. */
export const PROFILE_PAGE_CLASS = "mx-auto w-full max-w-7xl px-6";

/** Full-bleed width for Packages admin tables. */
export const PROFILE_PAGE_CLASS_WIDE =
  "mx-auto w-full max-w-none px-4 sm:px-6 lg:px-8";

/** Packages / Extensions / Partners / Users admin need the wide shell; other account pages stay constrained. */
export function profilePageClassForPath(pathname: string | null | undefined, admin = false): string {
  if (
    admin ||
    pathname?.startsWith("/profile/packages") ||
    pathname?.startsWith("/profile/extensions") ||
    pathname?.startsWith("/profile/partners") ||
    pathname?.startsWith("/profile/users") ||
    pathname?.startsWith("/profile/pdf-link") ||
    pathname?.startsWith("/profile/account") ||
    pathname?.startsWith("/profile/management") ||
    pathname?.startsWith("/profile/tools")
  ) {
    return PROFILE_PAGE_CLASS_WIDE;
  }
  return PROFILE_PAGE_CLASS;
}
