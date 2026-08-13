import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { oauthPasswordOnlyFromGoogleId } from "@/lib/auth/users-table";
import {
  generatePasswordResetToken,
  storePasswordResetToken,
} from "@/lib/auth/password-reset";
import {
  sendGoogleAccountPasswordHintEmail,
  sendPasswordResetEmail,
} from "@/lib/auth/password-reset-mailer";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { motionflowSiteOrigin } from "@/lib/motionflow-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  google_id?: string | null;
};

const GENERIC_SUCCESS =
  "If an account exists for that email, we’ve sent password reset instructions.";

function zodFieldErrors(err: import("zod").ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const fe = err.flatten().fieldErrors;
  for (const [k, v] of Object.entries(fe)) {
    if (v?.length) out[k] = v;
  }
  return out;
}

function requestSiteOrigin(req: NextRequest): string {
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim();
  if (host) {
    const proto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      (host.includes("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return motionflowSiteOrigin();
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false as const, message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false as const,
        message: "The given data was invalid.",
        errors: zodFieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const siteOrigin = requestSiteOrigin(req);

  try {
    const pool = getPool();
    const [rows] = await pool.execute<UserRow[]>(
      "SELECT id, email, name, google_id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [email],
    );
    const user = rows[0];

    if (user) {
      const googleLinked = oauthPasswordOnlyFromGoogleId(user);
      if (googleLinked) {
        await sendGoogleAccountPasswordHintEmail({
          email: user.email,
          name: user.name,
          siteOrigin,
        });
      } else {
        const token = generatePasswordResetToken();
        await storePasswordResetToken(user.email, token);
        await sendPasswordResetEmail({
          email: user.email,
          token,
          name: user.name,
          siteOrigin,
        });
      }
    }

    return NextResponse.json({
      success: true as const,
      message: GENERIC_SUCCESS,
    });
  } catch (e) {
    console.error("[auth/forgot-password]", e);
    return NextResponse.json(
      { success: false as const, message: "Server error. Try again later." },
      { status: 500 },
    );
  }
}
