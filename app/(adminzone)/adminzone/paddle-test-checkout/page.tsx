import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { PaddleTestCheckoutForm } from "@/components/admin/paddle-test-checkout-form";

export const metadata: Metadata = { title: "Paddle test checkout — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPaddleTestCheckoutPage() {
  const u = await getSessionUser();
  ensureInvestor(u);
  const hasClientToken = Boolean(process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN);

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Paddle test checkout"
        description="Open a Paddle.js overlay against arbitrary priceIds. Mirrors Laravel `AdminZoneController@paddleTestCheckout`."
        badge={{
          label: hasClientToken ? "Client token set" : "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN missing",
          tone: hasClientToken ? "default" : "destructive",
        }}
      />

      <Card className="border-border/60">
        <CardContent className="pt-6">
          <PaddleTestCheckoutForm
            defaultEmail={u?.email ?? null}
            hasClientToken={hasClientToken}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="space-y-2 pt-6 text-xs text-muted-foreground">
          <p>
            Custom-price (server-signed) checkouts (Laravel{" "}
            <code className="rounded bg-muted px-1 py-0.5">PaddleCustomCheckoutController</code>) are not yet
            implemented in Next.js. This form uses the standard Paddle.js overlay against existing catalog priceIds.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
