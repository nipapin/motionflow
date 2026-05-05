import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPartner } from "@/lib/auth/access-control";

const bodySchema = z
  .object({
    paymentMethod: z.enum(["paypal", "payoneer", "swift", "payproglobal"]),
    paymentMinWithdraw: z.coerce.number().min(50).max(20000),
    payoneerEmail: z.string().optional(),
    payProVendorId: z.string().optional(),
    payProEmail: z.string().optional(),
    paypalEmail: z.string().optional(),
  })
  .strict();

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !isPartner(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const v = parsed.data;
  let withdrawAccount: string;
  switch (v.paymentMethod) {
    case "payproglobal":
      withdrawAccount = JSON.stringify({
        email: v.payProEmail ?? "",
        vendor_id: Number(v.payProVendorId),
      });
      break;
    case "payoneer":
      withdrawAccount = JSON.stringify({ email: v.payoneerEmail ?? "" });
      break;
    case "paypal":
      withdrawAccount = JSON.stringify({ email: v.paypalEmail ?? "" });
      break;
    default:
      withdrawAccount = "{}";
  }

  const pool = getPool();
  await pool.execute(
    `UPDATE users SET withdraw_method = ?, withdraw_account = ?, withdraw_min_amount = ? WHERE id = ?`,
    [v.paymentMethod, withdrawAccount, v.paymentMinWithdraw, user.id],
  );

  await pool.execute(`UPDATE payouts SET method = ? WHERE recipient_id = ? AND status = 0`, [
    v.paymentMethod,
    user.id,
  ]);

  return NextResponse.json({ ok: true });
}
