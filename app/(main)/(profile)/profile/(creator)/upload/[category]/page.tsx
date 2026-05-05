import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { UPLOAD_CATEGORIES } from "@/lib/author/upload-categories";
import { Badge } from "@/components/ui/badge";
import { UploadDraftForm } from "@/components/author/upload-draft-form";

type PageProps = { params: Promise<{ category: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  return { title: `Upload — ${category}` };
}

export default async function UploadCategoryPage({ params }: PageProps) {
  const user = await getSessionUser();
  if (!user) return null;
  const { category } = await params;
  const meta = UPLOAD_CATEGORIES.find((c) => c.slug === category);
  if (!meta) notFound();

  const autoApproval = user.access >= 10;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Upload — {meta.label}</h1>
        </div>
        {autoApproval ? (
          <Badge className="w-fit bg-emerald-600 text-white">Auto-approval enabled</Badge>
        ) : (
          <Badge variant="secondary" className="w-fit">
            Pending review on submit
          </Badge>
        )}
      </div>
      <UploadDraftForm indexCategorySlug={meta.slug} />
    </div>
  );
}
