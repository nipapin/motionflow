import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { DownloadsList } from "@/components/downloads-list";
import { ProfileEmptyState } from "@/components/profile/profile-empty-state";
import { Button } from "@/components/ui/button";
import { getDownloadsForUser } from "@/lib/downloads";

export const metadata: Metadata = {
  title: "My downloads",
};

export const dynamic = "force-dynamic";

export default async function ProfileDownloadsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const { items: list, queryFailed } = await getDownloadsForUser(user.id);

  if (queryFailed) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My downloads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Subscription download history</p>
        </div>
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Downloads could not be loaded. Check that the database table{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">subscription_downloads</code>{" "}
            exists and that MySQL env vars match your Laravel app. Server logs include the underlying error.
          </p>
        </div>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My downloads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Subscription download history</p>
        </div>
        <ProfileEmptyState
          icon={Download}
          title="No downloads yet"
          description="Subscription downloads appear here after you download an item while your subscription is active."
        >
          <Button asChild size="sm">
            <Link href="/">Browse catalog</Link>
          </Button>
        </ProfileEmptyState>
      </div>
    );
  }

  const clientItems = list.map((row) => {
    const titleFallback = `Item #${row.itemId}`;
    return {
      id: row.id,
      itemId: row.itemId,
      product: row.product,
      titleFallback,
      createdAt: row.createdAt,
    };
  });

  return <DownloadsList items={clientItems} />;
}
