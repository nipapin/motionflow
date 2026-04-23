"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Upload, Download, RefreshCw, Trash2, Copy, Check, FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth-provider";
import { CreatorAiGateModal } from "@/components/creator-ai-gate-modal";
import { SignInModal } from "@/components/sign-in-modal";
import { useCreatorAiGateAfterSignIn } from "@/hooks/use-creator-ai-gate-after-sign-in";
import {
  type GenerationStatus,
  useGenerations,
} from "@/hooks/use-generations";
import { GenerationsBadge } from "@/components/generations-badge";
import {
  CREATOR_AI_REQUIRED_CODE,
  getAiGenerateBlockReason,
} from "@/lib/ai-generation-gate";

type OutputFormat = "text" | "srt" | "vtt";

interface OutputFormatOption {
  id: OutputFormat;
  label: string;
  extension: string;
  mime: string;
}

const outputFormats: OutputFormatOption[] = [
  { id: "text", label: "Plain Text (.txt)", extension: ".txt", mime: "text/plain" },
  { id: "srt", label: "SRT Subtitles (.srt)", extension: ".srt", mime: "application/x-subrip" },
  { id: "vtt", label: "VTT Subtitles (.vtt)", extension: ".vtt", mime: "text/vtt" },
];

interface TranscriptionHistory {
  id: string;
  filename: string;
  format: OutputFormat;
  text: string;
  detectedLanguage: string | null;
  timestamp: Date;
}

type ApiGenerationRecord = {
  id: string;
  status: string;
  settings: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

function parseFormat(value: unknown): OutputFormat {
  if (value === "srt" || value === "vtt" || value === "text") return value;
  return "text";
}

function recordsToHistory(rows: ApiGenerationRecord[]): TranscriptionHistory[] {
  const out: TranscriptionHistory[] = [];
  for (const row of rows) {
    if (row.status !== "ok" || !row.result) continue;
    const r = row.result;
    const s = row.settings;
    const text =
      typeof r.text === "string"
        ? r.text
        : typeof r.transcript === "string"
          ? r.transcript
          : "";
    if (!text) continue;
    const filename =
      typeof s.filename === "string" && s.filename
        ? s.filename
        : "transcription";
    const format = parseFormat(r.output_format ?? s.output_format);
    const detectedLanguage =
      typeof r.detected_language === "string" ? r.detected_language : null;
    out.push({
      id: row.id,
      filename,
      format,
      text,
      detectedLanguage,
      timestamp: new Date(row.created_at),
    });
  }
  return out;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const HISTORY_PREVIEW_LIMIT = 5;

function stripExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return name;
  return name.slice(0, idx);
}

function downloadTextFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SpeechToText() {
  const { user } = useAuth();
  const {
    status: generations,
    loading: generationsLoading,
    error: generationsError,
    authenticated,
    setStatus: setGenerationsStatus,
    refresh: refreshGenerations,
  } = useGenerations();

  const [signInOpen, setSignInOpen] = useState(false);
  const [creatorAiGateOpen, setCreatorAiGateOpen] = useState(false);
  const [creatorAiVariant, setCreatorAiVariant] = useState<
    "subscribe" | "upgrade"
  >("subscribe");

  const { markGuestWantedGenerate } = useCreatorAiGateAfterSignIn(
    user,
    generations,
    generationsLoading,
    signInOpen,
    setCreatorAiGateOpen,
    setCreatorAiVariant,
  );

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>("text");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState("");
  const [transcribedFormat, setTranscribedFormat] =
    useState<OutputFormat>("text");
  const [transcribedFilename, setTranscribedFilename] = useState<string>("");
  const [history, setHistory] = useState<TranscriptionHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/me/generation-records?tool=stt&limit=20", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ApiGenerationRecord[] };
      setHistory(recordsToHistory(data.items ?? []));
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const remaining = generations?.remaining ?? 0;
  const atLimitForCreatorAi =
    user &&
    generations?.plan === "creator_ai" &&
    !generationsLoading &&
    remaining <= 0;

  const applyPickedFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setErrorMessage("Audio file must be under 25 MB.");
      return;
    }
    setErrorMessage(null);
    setUploadedFile(file);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyPickedFile(e.target.files?.[0]);
  };

  const handleDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    applyPickedFile(e.dataTransfer.files?.[0]);
  };

  const handleTranscribe = async () => {
    setErrorMessage(null);
    if (!uploadedFile) return;
    if (isTranscribing || generationsLoading) return;

    const block = getAiGenerateBlockReason(
      user,
      generations,
      generationsLoading,
    );
    if (block === "sign_in") {
      markGuestWantedGenerate();
      setSignInOpen(true);
      return;
    }
    if (block === "needs_creator_ai") {
      setCreatorAiVariant(
        generations?.plan === "creator" ? "upgrade" : "subscribe",
      );
      setCreatorAiGateOpen(true);
      return;
    }
    if (block === "limit") {
      setErrorMessage(
        "You've reached your generation limit for this period.",
      );
      return;
    }

    setIsTranscribing(true);

    try {
      const form = new FormData();
      form.append("file", uploadedFile);
      form.append("output_format", selectedFormat);

      const res = await fetch("/api/generations/stt", {
        method: "POST",
        credentials: "include",
        body: form,
      });

      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        output_format?: OutputFormat;
        detected_language?: string | null;
        filename?: string;
        error?: string;
        code?: string;
        plan?: string;
        generations?: GenerationStatus;
      };

      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        void refreshGenerations();
        setCreatorAiVariant(data.plan === "creator" ? "upgrade" : "subscribe");
        setCreatorAiGateOpen(true);
        return;
      }

      if (!res.ok) {
        if (data.generations) {
          setGenerationsStatus(data.generations);
        } else {
          void refreshGenerations();
        }
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      if (!data.text) {
        throw new Error("No transcription returned");
      }

      if (data.generations) {
        setGenerationsStatus(data.generations);
      } else {
        void refreshGenerations();
      }

      const resolvedFormat = data.output_format ?? selectedFormat;
      const resolvedFilename = data.filename || uploadedFile.name;

      setTranscribedText(data.text);
      setTranscribedFormat(resolvedFormat);
      setTranscribedFilename(resolvedFilename);

      void refreshHistory();

      setUploadedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to transcribe audio";
      setErrorMessage(message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcribedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const removeFromHistory = useCallback(
    async (id: string) => {
      setHistory((prev) => prev.filter((h) => h.id !== id));
      try {
        await fetch(`/api/me/generation-records/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
      } catch {
        void refreshHistory();
      }
    },
    [refreshHistory],
  );

  const downloadTranscription = (
    text: string,
    format: OutputFormat,
    sourceName: string,
  ) => {
    const fmt = outputFormats.find((f) => f.id === format) ?? outputFormats[0];
    const base = stripExtension(sourceName) || "transcription";
    downloadTextFile(text, `${base}${fmt.extension}`, fmt.mime);
  };

  const triggerClasses =
    "w-full h-11 bg-background/50 border-blue-500/30 text-foreground rounded-xl px-4 hover:border-blue-500/60 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30";

  const currentFormat =
    outputFormats.find((f) => f.id === transcribedFormat) ?? outputFormats[0];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2 tracking-tight">Speech to Text</h1>
          <p className="text-muted-foreground">Transcribe audio and video files with OpenAI Whisper large-v3</p>
        </div>

        <GenerationsBadge
          status={generations}
          loading={generationsLoading}
          authenticated={authenticated}
          error={generationsError}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {/* Upload Section */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 block">Upload File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDropZoneDragOver}
              onDrop={handleDropZoneDrop}
              className="w-full py-8 border-2 border-dashed border-blue-500/30 rounded-xl hover:border-blue-500/60 smooth flex flex-col items-center justify-center gap-3 bg-background/30"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              {uploadedFile ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">{uploadedFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Drop audio/video file here</p>
                  <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A, FLAC, OGG, MP4, MOV — up to 25 MB</p>
                </div>
              )}
            </button>
          </div>

          {/* Output Format */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label
              htmlFor="stt-format"
              className="text-sm font-medium text-foreground mb-3 block"
            >
              Output Format
            </label>
            <Select
              value={selectedFormat}
              onValueChange={(v) => setSelectedFormat(v as OutputFormat)}
            >
              <SelectTrigger id="stt-format" className={triggerClasses}>
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                {outputFormats.map((format) => (
                  <SelectItem key={format.id} value={format.id}>
                    {format.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => void handleTranscribe()}
            disabled={
              !uploadedFile ||
              isTranscribing ||
              generationsLoading
            }
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium smooth shadow-lg shadow-blue-500/25 disabled:opacity-50"
          >
            {isTranscribing ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Transcribing...
              </>
            ) : (
              <>
                <FileAudio className="w-5 h-5 mr-2" />
                Transcribe
              </>
            )}
          </Button>

          {atLimitForCreatorAi && (
            <p className="text-sm text-red-400 text-center">
              You&apos;ve reached your generation limit for this period.
            </p>
          )}

          {errorMessage && (
            <p className="text-sm text-red-400 text-center">{errorMessage}</p>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 min-h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-foreground">Transcription</h3>
              {transcribedText && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyToClipboard}
                    className="border-blue-500/30 hover:border-blue-500/60 rounded-lg"
                  >
                    {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      downloadTranscription(
                        transcribedText,
                        transcribedFormat,
                        transcribedFilename,
                      )
                    }
                    className="bg-white text-black hover:bg-white/90 rounded-lg"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download {currentFormat.extension}
                  </Button>
                </div>
              )}
            </div>
            {transcribedText ? (
              <div className="rounded-xl border border-blue-500/20 bg-background/30 p-5">
                <p className="text-foreground leading-relaxed whitespace-pre-wrap font-mono text-sm">{transcribedText}</p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <Mic className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No transcription yet</h3>
                <p className="text-muted-foreground max-w-sm">Upload a file to get started</p>
              </div>
            )}
          </div>

          {user ? (
            <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-foreground">
                  Previous Transcriptions
                </h3>
                <Link
                  href="/profile/generations?tab=stt"
                  className="text-sm text-blue-400 hover:underline"
                >
                  View all
                </Link>
              </div>
              {historyLoading && history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Loading…
                </p>
              ) : history.length > 0 ? (
                <div className="space-y-3">
                  {history.slice(0, HISTORY_PREVIEW_LIMIT).map((item) => {
                    const fmt =
                      outputFormats.find((f) => f.id === item.format) ??
                      outputFormats[0];
                    return (
                      <div key={item.id} className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth group">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                          <FileAudio className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground font-medium truncate">{item.filename}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {fmt.label}
                            {item.detectedLanguage
                              ? ` | ${item.detectedLanguage}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              downloadTranscription(
                                item.text,
                                item.format,
                                item.filename,
                              )
                            }
                            className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeFromHistory(item.id)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No previous transcriptions
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <SignInModal
        open={signInOpen}
        onOpenChange={setSignInOpen}
        onAuthSuccess={() => setSignInOpen(false)}
      />
      <CreatorAiGateModal
        open={creatorAiGateOpen}
        onOpenChange={setCreatorAiGateOpen}
        variant={creatorAiVariant}
      />
    </div>
  );
}
