import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  getPackagesAuthorBySlug,
  isPackagesAdmin,
} from "@/lib/packages-admin";
import {
  getGalToolkitDemoManifest,
  listDemoHosts,
  listGalToolkitDemoVersionsFromR2,
} from "@/lib/galtoolkit-demo";
import { listSpunkramVersionsFromR2 } from "@/lib/spunkram-release";
import { listR2ObjectsForAuthor } from "@/lib/r2-list";
import { listR2SyncEvents } from "@/lib/r2sync-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const author = getPackagesAuthorBySlug(req.nextUrl.searchParams.get("author"));
  if (!author) {
    return NextResponse.json({ error: "MISSING_AUTHOR" }, { status: 400 });
  }

  try {
    const [objects, events] = await Promise.all([
      listR2ObjectsForAuthor(author).catch(() => []),
      listR2SyncEvents({ authorId: author.id, limit: 30 }).catch(() => []),
    ]);

    if (author.slug === "premiere-gal") {
      const demos = await Promise.all(
        listDemoHosts().map(async (host) => {
          const [manifest, versions] = await Promise.all([
            getGalToolkitDemoManifest(host),
            listGalToolkitDemoVersionsFromR2(host).catch(() => []),
          ]);
          return { host, manifest, versions };
        }),
      );
      return NextResponse.json({ author, demos, objects, events });
    }

    const spunkramVersions = await listSpunkramVersionsFromR2().catch(() => []);
    return NextResponse.json({ author, spunkramVersions, objects, events });
  } catch (err) {
    console.error("[studio/packages]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
