import type { Metadata } from "next";
import Link from "next/link";
import { CloudUpload } from "lucide-react";
import { UPLOAD_CATEGORIES } from "@/lib/author/upload-categories";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Upload",
};

export default function UploadPickerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add a new project</h1>
        <p className="text-muted-foreground">Choose a category to open the upload form.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {UPLOAD_CATEGORIES.map((c) => (
          <Link key={c.slug} href={`/profile/upload/${c.slug}`}>
            <Card className="h-full border-border/60 transition-colors hover:border-primary/50 hover:bg-card/80">
              <CardContent className="flex items-center gap-3 p-5">
                <CloudUpload className="h-8 w-8 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.slug}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
