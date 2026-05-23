"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SttHistory } from "@/lib/generations-types";
import {
  STT_FORMAT_META,
  downloadTranscriptFile,
  stripExtension,
} from "@/lib/generations-utils";

interface Props {
  item: SttHistory | null;
  onClose: () => void;
}

export function TranscriptDialog({ item, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!item) setCopied(false);
  }, [item]);

  const handleCopy = useCallback(async (text: string) => {
    if (!text) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* ignore clipboard errors */
    }
  }, []);

  const handleDownload = useCallback((sttItem: SttHistory) => {
    if (!sttItem.text) return;
    const meta = STT_FORMAT_META[sttItem.format] ?? STT_FORMAT_META.text;
    const base = stripExtension(sttItem.filename) || "transcription";
    downloadTranscriptFile(sttItem.text, `${base}${meta.extension}`, meta.mime);
  }, []);

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl border-blue-500/30 bg-card/95 backdrop-blur">
        <DialogHeader>
          <DialogTitle className="text-foreground">Transcription</DialogTitle>
          <DialogDescription>
            {item
              ? [item.language || null, item.timestamp.toLocaleString()]
                  .filter(Boolean)
                  .join(" · ")
              : ""}
          </DialogDescription>
        </DialogHeader>

        {item ? (
          <>
            <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-blue-500/20 bg-background/40 p-4">
              <pre className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground font-sans">
                {item.text}
              </pre>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-blue-500/30 text-foreground hover:border-blue-500/60"
                onClick={() => void handleCopy(item.text)}
              >
                {copied ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-400"
                onClick={() => handleDownload(item)}
              >
                <Download className="w-4 h-4 mr-2" />
                Download{" "}
                {(STT_FORMAT_META[item.format] ?? STT_FORMAT_META.text).label}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
