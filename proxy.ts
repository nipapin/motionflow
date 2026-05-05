import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LARAVEL_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host")?.toLowerCase() ?? "";

  // Demo: route a specific subdomain into a dedicated Next.js page.
  if ((host === "abc123.motionflow.pro" || host.startsWith("abc123.motionflow.pro:")) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/subdomain-demo/abc123";
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
  matcher: ["/", "/profile/:path*"],
};
