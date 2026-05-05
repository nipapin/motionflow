import type { Metadata } from "next";
import { headers } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Subdomain Demo — ${slug}` };
}

export default async function SubdomainDemoPage({ params }: PageProps) {
  const { slug } = await params;
  const h = await headers();
  const host = h.get("host") ?? "unknown";

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-xl">Subdomain routing demo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            This page is rendered by Next.js for subdomain <strong>{slug}</strong>.
          </p>
          <p>
            Current host: <code className="rounded bg-muted px-1">{host}</code>
          </p>
          <p>
            Mapping is configured in <code className="rounded bg-muted px-1">proxy.ts</code>:
            <code className="ml-1 rounded bg-muted px-1">abc123.motionflow.pro/</code> rewrites to
            <code className="ml-1 rounded bg-muted px-1">/subdomain-demo/abc123</code>.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
