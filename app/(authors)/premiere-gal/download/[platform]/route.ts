import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { sendGhlEvent } from "@/lib/ghl-forwarder";

const DOWNLOAD_FILES: Record<string, string> = {
  windows: "https://cdn.motionflow.pro/public/downloads/galtoolkit-windows-installer.exe",
  mac: "https://cdn.motionflow.pro/public/downloads/galtoolkit-mac-installer.dmg",
};

/**
 * Port of Laravel `PremieregalController::download()`. Requires auth so we can
 * report first/last name + email to GoHighLevel. The installers are ~80-180MB,
 * so we redirect to the CDN copy instead of streaming them through Next.js.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const fileUrl = DOWNLOAD_FILES[platform];
  if (!fileUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [firstName, ...rest] = user.name.split(" ");
  await sendGhlEvent("free_download", {
    tier: null,
    first_name: firstName || null,
    last_name: rest.join(" ") || null,
    email: user.email,
    phone: null,
    amount: null,
    currency: null,
  });

  return NextResponse.redirect(fileUrl);
}
