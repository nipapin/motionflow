"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Volume2,
  Download,
  RefreshCw,
  Trash2,
  RotateCcw,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { WaveformPlayer } from "@/components/waveform-player";
import { useAuth } from "@/components/auth-provider";
import { CreatorAiGateModal } from "@/components/creator-ai-gate-modal";
import { SignInModal } from "@/components/sign-in-modal";
import { cn } from "@/lib/utils";
import { useCreatorAiGateAfterSignIn } from "@/hooks/use-creator-ai-gate-after-sign-in";
import {
  useGenerations,
  type GenerationStatus,
} from "@/hooks/use-generations";
import { GenerationsBadge } from "@/components/generations-badge";
import {
  CREATOR_AI_REQUIRED_CODE,
  getAiGenerateBlockReason,
} from "@/lib/ai-generation-gate";

const MAX_TEXT_LENGTH = 1000;

const voicePresets = [
  { id: "Wise_Woman", label: "Wise Woman" },
  { id: "Friendly_Person", label: "Friendly Person" },
  { id: "Inspirational_girl", label: "Inspirational Girl" },
  { id: "Deep_Voice_Man", label: "Deep Voice Man" },
  { id: "Calm_Woman", label: "Calm Woman" },
  { id: "Casual_Guy", label: "Casual Guy" },
  { id: "Lively_Girl", label: "Lively Girl" },
  { id: "Patient_Man", label: "Patient Man" },
  { id: "Young_Knight", label: "Young Knight" },
  { id: "Determined_Man", label: "Determined Man" },
  { id: "Lovely_Girl", label: "Lovely Girl" },
  { id: "Decent_Boy", label: "Decent Boy" },
  { id: "Imposing_Manner", label: "Imposing Manner" },
  { id: "Elegant_Man", label: "Elegant Man" },
  { id: "Abbess", label: "Abbess" },
  { id: "Sweet_Girl_2", label: "Sweet Girl" },
  { id: "Exuberant_Girl", label: "Exuberant Girl" },
];

const emotionOptions = [
  { id: "auto", label: "Auto" },
  { id: "neutral", label: "Neutral" },
  { id: "happy", label: "Happy" },
  { id: "calm", label: "Calm" },
  { id: "sad", label: "Sad" },
  { id: "angry", label: "Angry" },
  { id: "fearful", label: "Fearful" },
  { id: "disgusted", label: "Disgusted" },
  { id: "surprised", label: "Surprised" },
];

/** Defaults for the parameters we no longer expose in the UI. */
const FIXED_AUDIO_FORMAT = "mp3" as const;

type ApiGenerationRecord = {
  id: string;
  status: string;
  settings: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

interface TtsHistoryItem {
  id: string;
  text: string;
  voice: string;
  speed: number;
  audioUrl: string;
}

const VOICE_LABELS = new Map(voicePresets.map((v) => [v.id, v.label]));

async function downloadRemoteAudioFile(url: string, filename: string) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function recordsToHistory(rows: ApiGenerationRecord[]): TtsHistoryItem[] {
  const out: TtsHistoryItem[] = [];
  for (const row of rows) {
    if (row.status !== "ok" || !row.result) continue;
    const audioUrl =
      typeof row.result.audio_url === "string"
        ? row.result.audio_url
        : typeof row.result.audio === "string"
          ? row.result.audio
          : "";
    if (!audioUrl) continue;
    const s = row.settings;
    const speedRaw = typeof s.speed === "number" ? s.speed : Number(s.speed ?? 1);
    out.push({
      id: row.id,
      text: typeof s.text === "string" ? s.text : "",
      voice: typeof s.voice === "string" ? s.voice : "",
      speed: Number.isFinite(speedRaw) ? speedRaw : 1,
      audioUrl,
    });
  }
  return out;
}

interface TtsSettings {
  voice_id: string;
  emotion: string;
  speed: number;
  volume: number;
  pitch: number;
}

const DEFAULT_SETTINGS: TtsSettings = {
  voice_id: "Wise_Woman",
  emotion: "auto",
  speed: 1,
  volume: 1,
  pitch: 0,
};

export function TextToSpeech() {
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

  const [text, setText] = useState("");
  const [settings, setSettings] = useState<TtsSettings>(DEFAULT_SETTINGS);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [generatedVoice, setGeneratedVoice] = useState<string>("");
  const [generatedSpeed, setGeneratedSpeed] = useState<number>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [history, setHistory] = useState<TtsHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewPlayingVoice, setPreviewPlayingVoice] = useState<string | null>(
    null,
  );

  const stopVoicePreview = useCallback(() => {
    const audio = previewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPreviewPlayingVoice(null);
  }, []);

  const toggleVoicePreview = useCallback(
    (voiceId: string) => {
      if (!voiceId) return;
      if (previewPlayingVoice === voiceId) {
        stopVoicePreview();
        return;
      }
      const previous = previewAudioRef.current;
      if (previous) {
        previous.pause();
        previous.currentTime = 0;
      }
      const audio = new Audio(`/voice-previews/${voiceId}.mp3`);
      previewAudioRef.current = audio;
      audio.addEventListener("ended", () => {
        setPreviewPlayingVoice((cur) => (cur === voiceId ? null : cur));
      });
      audio.addEventListener("error", () => {
        setPreviewPlayingVoice((cur) => (cur === voiceId ? null : cur));
      });
      setPreviewPlayingVoice(voiceId);
      void audio.play().catch(() => {
        setPreviewPlayingVoice((cur) => (cur === voiceId ? null : cur));
      });
    },
    [previewPlayingVoice, stopVoicePreview],
  );

  useEffect(() => {
    return () => {
      const audio = previewAudioRef.current;
      if (audio) {
        audio.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    stopVoicePreview();
  }, [settings.voice_id, stopVoicePreview]);

  const characterCount = text.length;
  const overLimit = characterCount > MAX_TEXT_LENGTH;
  const remaining = generations?.remaining ?? 0;
  const atLimitForCreatorAi =
    user &&
    generations?.plan === "creator_ai" &&
    !generationsLoading &&
    remaining <= 0;

  const updateSetting = useCallback(
    <K extends keyof TtsSettings>(key: K, value: TtsSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const refreshHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/me/generation-records?tool=tts&limit=20", {
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

  const removeHistoryItem = useCallback(
    async (id: string) => {
      setHistory((prev) => prev.filter((it) => it.id !== id));
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

  const repeatHistoryItem = useCallback((item: TtsHistoryItem) => {
    setText(item.text);
    setSettings((prev) => ({
      ...prev,
      voice_id: item.voice || prev.voice_id,
      speed: item.speed || prev.speed,
    }));
    setErrorMessage(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleGenerate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!text.trim() || isGenerating || generationsLoading) return;
    if (overLimit) {
      setErrorMessage(
        `Please keep the text under ${MAX_TEXT_LENGTH} characters.`,
      );
      return;
    }

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

    setIsGenerating(true);

    try {
      const res = await fetch("/api/generations/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: settings.voice_id,
          emotion: settings.emotion,
          speed: settings.speed,
          volume: settings.volume,
          pitch: settings.pitch,
          audio_format: FIXED_AUDIO_FORMAT,
          language_boost: "Automatic",
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        audio_url?: string;
        voice?: string;
        speed?: number;
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

      if (!data.audio_url) {
        throw new Error("No audio returned");
      }

      if (data.generations) {
        setGenerationsStatus(data.generations);
      } else {
        void refreshGenerations();
      }
      setGeneratedAudio(data.audio_url);
      setGeneratedVoice(data.voice ?? settings.voice_id);
      setGeneratedSpeed(
        typeof data.speed === "number" ? data.speed : settings.speed,
      );
      void refreshHistory();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate speech";
      setErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const triggerClasses =
    "w-full h-11 bg-background/50 border-blue-500/30 text-foreground rounded-xl px-4 hover:border-blue-500/60 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30";

  const onDownloadGeneratedMp3 = useCallback(() => {
    if (!generatedAudio) return;
    void downloadRemoteAudioFile(generatedAudio, "speech.mp3");
  }, [generatedAudio]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2 tracking-tight">
            Text to Speech
          </h1>
          <p className="text-muted-foreground">
            Convert text into natural-sounding speech with MiniMax Speech 2.8 HD
          </p>
        </div>

        <GenerationsBadge
          status={generations}
          loading={generationsLoading}
          authenticated={authenticated}
          error={generationsError}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleGenerate} className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <div className="flex items-center justify-between mb-3">
              <label
                htmlFor="tts-text"
                className="text-sm font-medium text-foreground"
              >
                Text
              </label>
              <span
                className={cn(
                  "text-xs",
                  overLimit ? "text-red-400" : "text-muted-foreground",
                )}
              >
                {characterCount} / {MAX_TEXT_LENGTH}
              </span>
            </div>
            <textarea
              id="tts-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_TEXT_LENGTH}
              placeholder="Enter the text you want to convert to speech…"
              className={cn(
                "w-full h-40 bg-background/50 border rounded-xl p-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none smooth",
                overLimit
                  ? "border-red-500/60 focus:border-red-500/80"
                  : "border-blue-500/30 focus:border-blue-500/60",
              )}
            />
            <p className="text-[11px] text-muted-foreground mt-2">
              Tip: write numbers as words (e.g. “twenty twenty-six”) and use
              <code className="mx-1 px-1 rounded bg-background/60 border border-blue-500/20 text-foreground">
                &lt;#0.5#&gt;
              </code>
              to add a 0.5 s pause.
            </p>
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label
              htmlFor="tts-voice"
              className="text-sm font-medium text-foreground mb-3 block"
            >
              Voice
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Select
                  value={settings.voice_id}
                  onValueChange={(v) => updateSetting("voice_id", v)}
                >
                  <SelectTrigger id="tts-voice" className={triggerClasses}>
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {voicePresets.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                onClick={() => toggleVoicePreview(settings.voice_id)}
                title={
                  previewPlayingVoice === settings.voice_id
                    ? "Stop preview"
                    : "Play voice preview"
                }
                aria-label={
                  previewPlayingVoice === settings.voice_id
                    ? "Stop preview"
                    : "Play voice preview"
                }
                className="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl border border-blue-500/30 bg-background/50 text-blue-400 hover:border-blue-500/60 hover:text-blue-300 hover:bg-blue-500/10 smooth"
              >
                {previewPlayingVoice === settings.voice_id ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label
              htmlFor="tts-emotion"
              className="text-sm font-medium text-foreground mb-3 block"
            >
              Emotion
            </label>
            <Select
              value={settings.emotion}
              onValueChange={(v) => updateSetting("emotion", v)}
            >
              <SelectTrigger id="tts-emotion" className={triggerClasses}>
                <SelectValue placeholder="Select emotion" />
              </SelectTrigger>
              <SelectContent>
                {emotionOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  Speed
                </span>
                <span className="text-xs text-muted-foreground">
                  {settings.speed.toFixed(2)}x
                </span>
              </div>
              <Slider
                min={0.5}
                max={2}
                step={0.05}
                value={[settings.speed]}
                onValueChange={(v) => updateSetting("speed", v[0] ?? 1)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  Volume
                </span>
                <span className="text-xs text-muted-foreground">
                  {settings.volume.toFixed(1)}
                </span>
              </div>
              <Slider
                min={0}
                max={10}
                step={0.1}
                value={[settings.volume]}
                onValueChange={(v) => updateSetting("volume", v[0] ?? 1)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  Pitch
                </span>
                <span className="text-xs text-muted-foreground">
                  {settings.pitch > 0 ? "+" : ""}
                  {settings.pitch} st
                </span>
              </div>
              <Slider
                min={-12}
                max={12}
                step={1}
                value={[settings.pitch]}
                onValueChange={(v) => updateSetting("pitch", v[0] ?? 0)}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={
              !text.trim() || overLimit || isGenerating || generationsLoading
            }
            className="w-full h-12 bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium smooth shadow-lg shadow-blue-500/25 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Volume2 className="w-5 h-5 mr-2" />
                Generate Speech
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
        </form>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 min-h-[300px]">
            <h3 className="text-lg font-medium text-foreground mb-4">
              Generated audio
            </h3>
            {generatedAudio ? (
              <div className="rounded-xl border border-blue-500/20 bg-background/30 p-5 space-y-4">
                <WaveformPlayer
                  audioUrl={generatedAudio}
                  eagerLoad
                  className="gap-4"
                />

                <div className="flex items-center justify-between pt-4 border-t border-blue-500/20 gap-3 flex-wrap">
                  <div className="text-sm text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {VOICE_LABELS.get(generatedVoice) ?? generatedVoice}
                    </span>
                    <span className="mx-2">|</span>
                    <span>{generatedSpeed.toFixed(2)}x</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-white text-black hover:bg-white/90 rounded-lg"
                    onClick={onDownloadGeneratedMp3}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download MP3
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <Volume2 className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No audio generated yet
                </h3>
                <p className="text-muted-foreground max-w-sm">
                  Enter text and click generate to create AI speech.
                </p>
              </div>
            )}
          </div>

          {user ? (
            <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-foreground">
                  Previous generations
                </h3>
                <Link
                  href="/profile/generations?tab=tts"
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
                <ul className="space-y-3">
                  {history.slice(0, 5).map((item) => {
                    const actions = (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => repeatHistoryItem(item)}
                          title="Use these settings"
                          aria-label="Use these settings"
                          className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        {item.audioUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              void downloadRemoteAudioFile(
                                item.audioUrl,
                                `speech-${item.id}.mp3`,
                              )
                            }
                            title="Download"
                            aria-label="Download audio"
                            className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void removeHistoryItem(item.id)}
                          title="Delete"
                          aria-label="Delete"
                          className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );

                    return (
                      <li
                        key={item.id}
                        className="p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth space-y-3"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                            <Volume2 className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-sm text-foreground line-clamp-2"
                              title={item.text}
                            >
                              {item.text || "Untitled"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {VOICE_LABELS.get(item.voice) ??
                                item.voice ??
                                "Voice"}
                              {" · "}
                              {item.speed.toFixed(2)}x
                            </p>
                          </div>
                          {!item.audioUrl ? actions : null}
                        </div>
                        {item.audioUrl ? (
                          <WaveformPlayer
                            audioUrl={item.audioUrl}
                            className="gap-3"
                            trailingSlot={actions}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No previous generations yet.
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
