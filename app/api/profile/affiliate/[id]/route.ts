import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPartner } from "@/lib/auth/access-control";
import { updateShortLink } from "@/lib/author/affiliate";
import { motionflowSiteOrigin } from "@/lib/motionflow-urls";

const patchSchema = z.object({
  redirect: z.string().url().min(8),
  comment: z.string().max(200).nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !isPartner(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const origin = motionflowSiteOrigin().replace(/\/$/, "");
  try {
    const u = new URL(parsed.data.redirect);
    if (u.hostname !== new URL(origin).hostname) {
      return NextResponse.json({ error: "Redirect must use the marketplace hostname" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Bad redirect URL" }, { status: 400 });
  }

  const ok = await updateShortLink(user.id, id, parsed.data.redirect, parsed.data.comment ?? null);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
