import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LARAVEL_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  AFFILIATE_REF_COOKIE,
  AFFILIATE_REF_COOKIE_MAX_AGE_SEC,
  AFFILIATE_REF_QUERY_PARAM,
  normalizeAffiliateSlug,
} from "@/lib/affiliate/shared";

/** Prefer nginx `X-Forwarded-Host` — raw `Host` is often the upstream loopback. */
function requestHost(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim().toLowerCase() ?? "";
  }
  return (request.headers.get("host") ?? "").toLowerCase();
}

function hostMatches(host: string, apex: string): boolean {
  return host === apex || host.startsWith(`${apex}:`);
}

/**
 * Affiliate attribution is last-click: any valid `?ref=slug` overwrites the
 * previous cookie and restarts the 30-day window. We only validate the slug
 * shape here — resolving it to a partner needs MySQL, which this proxy cannot
 * reach, so `/api/affiliate/hit` clears the cookie if the slug is unknown.
 */
function withAffiliateReferralCookie(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const slug = normalizeAffiliateSlug(
    request.nextUrl.searchParams.get(AFFILIATE_REF_QUERY_PARAM),
  );
  if (!slug) return response;
  if (request.cookies.get(AFFILIATE_REF_COOKIE)?.value === slug) return response;

  response.cookies.set(AFFILIATE_REF_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: AFFILIATE_REF_COOKIE_MAX_AGE_SEC,
  });
  return response;
}

export function proxy(request: NextRequest) {
  return withAffiliateReferralCookie(request, route(request));
}

function route(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const host = requestHost(request);
  const isSpunkramHost = hostMatches(host, "spunkramv2.motionflow.pro");
  const isPremiereGalHost = hostMatches(host, "premieregal.motionflow.pro");

  // Demo: route a specific subdomain into a dedicated Next.js page.
  if (isSpunkramHost && (pathname === "/" || pathname.startsWith("/item/"))) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/spunkram" : `/spunkram${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (isPremiereGalHost) {
    // Legacy Laravel item URLs on this host redirected to the storefront home.
    if (pathname.startsWith("/item/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url, 301);
    }

    if (pathname === "/" || pathname === "/showcase" || pathname.startsWith("/download/")) {
      const url = request.nextUrl.clone();
      url.pathname = pathname === "/" ? "/premiere-gal" : `/premiere-gal${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // Main site bare /item/{id} is handled by app/(main)/item/[id] (Next).
  // Laravel may gateway-proxy that path to this Next process; slug URLs stay on Laravel.

  if (!pathname.startsWith("/profile")) {
    return NextResponse.next();
  }

  const hasNext = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const hasLaravel = Boolean(request.cookies.get(LARAVEL_COOKIE_NAME)?.value);
  if (!hasNext && !hasLaravel) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Broad matcher so a `?ref=` landing on any public page still writes the
  // referral cookie; the host rewrites and the /profile session gate above only
  // act on their own paths. Paths containing a dot (static files, sitemap.xml)
  // are excluded so assets do not pay for a proxy invocation.
  matcher: ["/((?!api|_next/static|_next/image|.*\\.).*)"],
};
