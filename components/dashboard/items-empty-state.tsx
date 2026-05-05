import Link from "next/link";
import { CloudUpload, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ItemsEmptyStateProps {
  team: boolean;
}

export function ItemsEmptyState({ team }: ItemsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/15 px-6 py-16 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted/50 ring-1 ring-border/50">
        <Layers className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      </div>
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
        {team ? "No team items yet" : "No projects here"}
      </h2>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        {team
          ? "When you collaborate on team uploads, they will appear in this view."
          : "Upload an After Effects template, audio pack, or asset — it will show up here while pending review and after publish."}
      </p>
      {!team ? (
        <Button className="mt-6 h-9 rounded-lg px-4 text-[13px] font-medium" asChild>
          <Link href="/profile/upload" className="inline-flex items-center gap-2">
            <CloudUpload className="size-4" strokeWidth={1.75} aria-hidden />
            New upload
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
