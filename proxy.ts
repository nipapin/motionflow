import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LARAVEL_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const isSpunkramHost =
    host === "spunkramv2.motionflow.pro" || host.startsWith("spunkramv2.motionflow.pro:");
  const isPremiereGalHost = false;
    //host === "premieregal.motionflow.pro" || host.startsWith("premieregal.motionflow.pro:");

  // Demo: route a specific subdomain into a dedicated Next.js page.
  if (isSpunkramHost && (pathname === "/" || pathname.startsWith("/item/"))) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/spunkram" : `/spunkram${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (
    isPremiereGalHost &&
    (pathname === "/" || pathname === "/showcase" || pathname.startsWith("/download/"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/premiere-gal" : `/premiere-gal${pathname}`;
    return NextResponse.rewrite(url);
  }

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
