import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAuthor } from "@/lib/auth/access-control";
import { createCoupon } from "@/lib/author/marketing";

const schema = z.object({
  code: z.string().min(2).max(50),
  type: z.enum(["value", "percent", "fixed"]),
  amount: z.coerce.number().int().min(1).max(1_000_000),
  maxUses: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  comment: z.string().max(100).nullable().optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !isAuthor(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  try {
    const id = await createCoupon({
      authorId: user.id,
      code: parsed.data.code,
      type: parsed.data.type,
      amount: parsed.data.amount,
      maxUses: parsed.data.maxUses ?? null,
      comment: parsed.data.comment ?? null,
    });
    return NextResponse.json({ id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not create coupon (duplicate code?)" }, { status: 400 });
  }
}
