import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LARAVEL_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/session";

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

export function proxy(request: NextRequest) {
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
  matcher: ["/", "/item/:path*", "/profile/:path*", "/showcase", "/download/:path*"],
};
