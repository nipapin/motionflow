"use client";

import { useContext, type ReactNode } from "react";
import { AiWorkspaceQuotaContext } from "@/components/ai-workspace-context";
import Link from "next/link";
import { ArrowUpRight, Check, Plus, Sparkles, X } from "lucide-react";
import { AI_GENERATION_COST } from "@/lib/ai-tool-cost";

export function AiGenerationCost({ cost = AI_GENERATION_COST }: { cost?: number }) {
  const unit = cost === 1 ? "generation" : "generations";
  return (
    <span title={`Costs ${cost} ${unit}`} className="ai-generation-cost inline-flex shrink-0 items-center gap-1 whitespace-nowrap border-l border-white/25 pl-2 text-xs font-medium">
      {cost}
      <Sparkles className="size-3.5" aria-hidden />
      <span className="sr-only"> {unit}</span>
    </span>
  );
}

export function AiToolHistoryLink() {
  const workspaceQuota = useContext(AiWorkspaceQuotaContext);
  if (workspaceQuota !== undefined) return null;

  return (
    <div className="ai-history-link flex justify-end">
      <Link href="/profile/generations" className="flex items-center gap-2 rounded-full border border-blue-500/30 bg-card/50 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-blue-500/10 hover:text-foreground">
        My generations <ArrowUpRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

export function AiPromptField({
  id, label, value, onValueChange, placeholder, maxLength, children,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  maxLength?: number;
  children?: ReactNode;
}) {
  return (
    <div className="ai-control ai-prompt rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="ai-prompt-input relative">
        <textarea id={id} value={value} onChange={event => onValueChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} className="h-32 w-full resize-y rounded-xl border border-blue-500/30 bg-background/50 p-4 pr-10 text-foreground placeholder:text-muted-foreground focus:outline-none" />
        {value.length > 0 && (
          <button type="button" onClick={() => onValueChange("")} aria-label={`Clear ${label.toLowerCase()}`} className="ai-prompt-clear absolute right-2 top-2 flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {maxLength !== undefined && (
        <p className={`mt-1 text-right text-[11px] ${value.length > maxLength ? "text-red-400" : "text-muted-foreground"}`} aria-live="polite">{value.length} / {maxLength}</p>
      )}
      {children}
    </div>
  );
}

/** Opens the existing picker; file uploads and generation stay in that dialog. */
export function AiImageAttachment({ label, attached, onChoose, onClear }: {
  label: string;
  attached: boolean;
  onChoose: () => void;
  onClear: () => void;
}) {
  return (
    <div className="ai-attachment flex items-center gap-2">
      <button type="button" onClick={onChoose} aria-label={`Choose ${label}`} title={`Choose ${label}`} className="ai-attachment-add flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-blue-500/25 bg-foreground/5 text-foreground transition-colors hover:border-blue-500/60 hover:bg-blue-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <Plus className="size-5" aria-hidden />
      </button>
      <span className="text-xs text-muted-foreground">{label}</span>
      {attached && (
        <>
          <Check className="size-3.5 text-blue-400" aria-label="Image attached" />
          <button type="button" onClick={onClear} aria-label={`Clear ${label}`} className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="size-3.5" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
