import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { publishSpunkramZxp } from "@/lib/spunkram-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GitHubReleaseAsset = {
  name?: string;
  browser_download_url?: string;
  url?: string;
  content_type?: string;
  size?: number;
};

type GitHubReleasePayload = {
  action?: string;
  release?: {
    tag_name?: string;
    name?: string;
    body?: string | null;
    draft?: boolean;
    prerelease?: boolean;
    published_at?: string | null;
    assets?: GitHubReleaseAsset[];
  };
  repository?: {
    full_name?: string;
  };
};

function verifyGitHubSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(received, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function repoAllowed(fullName: string | undefined): boolean {
  const expected = process.env.GITHUB_SPUNKRAM_REPO?.trim();
  if (!expected) return true; // unset = accept any (dev); set in prod
  return (fullName || "").toLowerCase() === expected.toLowerCase();
}

function pickZxpAsset(assets: GitHubReleaseAsset[] | undefined): GitHubReleaseAsset | null {
  if (!assets?.length) return null;
  const zxp = assets.find((a) => (a.name || "").toLowerCase().endsWith(".zxp"));
  return zxp || null;
}

/**
 * POST /api/github/webhook — GitHub Releases → R2 Spunkram ZXP + latest.json.
 * Verify X-Hub-Signature-256 with GITHUB_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[github-webhook] GITHUB_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGitHubSignature(rawBody, signature, secret)) {
    console.warn("[github-webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event") || "";
  if (event === "ping") {
    return NextResponse.json({ ok: true, pong: true });
  }
  if (event !== "release") {
    return NextResponse.json({ ok: true, skipped: `event:${event}` });
  }

  let payload: GitHubReleasePayload;
  try {
    payload = JSON.parse(rawBody) as GitHubReleasePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!repoAllowed(payload.repository?.full_name)) {
    console.info(
      `[github-webhook] Ignoring repo ${payload.repository?.full_name} (expected ${process.env.GITHUB_SPUNKRAM_REPO})`,
    );
    return NextResponse.json({ ok: true, skipped: "repo" });
  }

  const action = payload.action || "";
  if (action !== "published" && action !== "edited") {
    return NextResponse.json({ ok: true, skipped: `action:${action}` });
  }

  const release = payload.release;
  if (!release || release.draft) {
    return NextResponse.json({ ok: true, skipped: "draft" });
  }

  const tag = release.tag_name || "";
    const version = tag.replace(/^v/i, "");
  if (!version) {
    return NextResponse.json({ ok: true, skipped: "no_tag" });
  }

  const channel =
    release.prerelease || /-beta/i.test(version) ? ("beta" as const) : ("stable" as const);

  const asset = pickZxpAsset(release.assets);
  if (!asset?.browser_download_url && !asset?.url) {
    console.warn(`[github-webhook] No .zxp asset on release ${tag}`);
    return NextResponse.json({ ok: true, skipped: "no_zxp_asset" });
  }

  try {
    const downloadUrl = asset.browser_download_url || asset.url!;
    const headers: Record<string, string> = {
      Accept: "application/octet-stream",
      "User-Agent": "motionflow-spunkram-webhook",
    };
    const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(downloadUrl, { headers, redirect: "follow" });
    if (!res.ok) {
      console.error(`[github-webhook] Failed to download ZXP (${res.status}) from ${downloadUrl}`);
      return NextResponse.json({ error: "Download failed" }, { status: 502 });
    }
    const ab = await res.arrayBuffer();
    const body = Buffer.from(ab);

    const manifest = await publishSpunkramZxp({
      version,
      zxpBody: body,
      changelog: release.body || "",
      publishedAt: release.published_at || new Date().toISOString(),
      channel,
    });

    console.info(
      `[github-webhook] Published Spunkram ${manifest.version} (${channel}) → ${manifest.zxpUrl}`,
    );
    return NextResponse.json({
      ok: true,
      version: manifest.version,
      zxpUrl: manifest.zxpUrl,
      channel,
    });
  } catch (err) {
    console.error("[github-webhook] Publish failed", err);
    return NextResponse.json({ error: "Publish failed" }, { status: 500 });
  }
}
