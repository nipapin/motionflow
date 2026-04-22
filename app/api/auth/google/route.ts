import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_MAX_AGE,
  googleCallbackUrl,
} from "@/lib/auth/google-oauth";
import { baseCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID is not configured" },
      { status: 500 },
    );
  }

  const state = crypto.randomUUID();
  const redirectUri = googleCallbackUrl(req);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    ...baseCookieOptions(req),
    maxAge: GOOGLE_OAUTH_STATE_MAX_AGE,
  });
  return res;
}
