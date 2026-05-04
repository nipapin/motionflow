import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPartner } from "@/lib/auth/access-control";
import { createShortLink } from "@/lib/author/affiliate";
import { motionflowSiteOrigin } from "@/lib/motionflow-urls";

const postSchema = z.object({
  redirect: z.string().url().min(8),
  comment: z.string().max(200).nullable().optional(),
});

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

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const origin = motionflowSiteOrigin().replace(/\/$/, "");
  try {
    const u = new URL(parsed.data.redirect);
    const hostOk = u.hostname === new URL(origin).hostname;
    if (!hostOk) {
      return NextResponse.json({ error: "Redirect must use the marketplace hostname" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Bad redirect URL" }, { status: 400 });
  }

  try {
    const id = await createShortLink(user.id, parsed.data.redirect, parsed.data.comment ?? null);
    return NextResponse.json({ id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create link" }, { status: 500 });
  }
}
