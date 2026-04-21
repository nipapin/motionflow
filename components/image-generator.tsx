"use client";

import { useState, type FormEvent } from "react";
import {
  Wand2,
  Download,
  RefreshCw,
  ImageIcon,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGenerations, type GenerationStatus } from "@/hooks/use-generations";
import { GenerationsBadge } from "@/components/generations-badge";

const stylePresets = [
  { id: "realistic", label: "Realistic" },
  { id: "anime", label: "Anime" },
  { id: "3d", label: "3D Render" },
  { id: "digital-art", label: "Digital Art" },
  { id: "oil-painting", label: "Oil Painting" },
  { id: "watercolor", label: "Watercolor" },
];

const aspectRatios = [
  { id: "1:1", label: "1:1 — Square" },
  { id: "16:9", label: "16:9 — Widescreen" },
  { id: "9:16", label: "9:16 — Portrait" },
  // { id: "4:3", label: "4:3 — Standard" },
  // { id: "3:4", label: "3:4 — Vertical" },
  // { id: "3:2", label: "3:2 — Photo" },
  // { id: "2:3", label: "2:3 — Photo Portrait" },
  // { id: "21:9", label: "21:9 — Cinematic" },
];

interface GenerationHistory {
  id: string;
  prompt: string;
  style: string;
  ratio: string;
  images: string[];
  timestamp: Date;
}

export function ImageGenerator() {
  const {
    status: generations,
    loading: generationsLoading,
    authenticated,
    setStatus: setGenerationsStatus,
    refresh: refreshGenerations,
  } = useGenerations();

  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("realistic");
  const [selectedRatio, setSelectedRatio] = useState("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [history, setHistory] = useState<GenerationHistory[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const remaining = generations?.remaining ?? 0;
  const noGenerationsLeft =
    authenticated && !generationsLoading && remaining <= 0;

  const handleGenerate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!prompt.trim() || isGenerating || !authenticated || noGenerationsLeft) {
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch("/api/generations/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          style: selectedStyle,
          aspect_ratio: selectedRatio,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        images?: string[];
        error?: string;
        generations?: GenerationStatus;
      };

      if (!res.ok) {
        if (data.generations) {
          setGenerationsStatus(data.generations);
        } else {
          refreshGenerations();
        }
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const images = data.images ?? [];
      if (!images.length) {
        throw new Error("No images returned");
      }

      if (data.generations) {
        setGenerationsStatus(data.generations);
      } else {
        refreshGenerations();
      }
      setGeneratedImages(images);
      setHistory((prev) => [
        {
          id: Date.now().toString(),
          prompt: prompt.trim(),
          style: selectedStyle,
          ratio: selectedRatio,
          images,
          timestamp: new Date(),
        },
        ...prev,
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate image";
      setErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const removeFromHistory = (id: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
  };

  const triggerClasses =
    "w-full h-11 bg-background/50 border-blue-500/30 text-foreground rounded-xl px-4 hover:border-blue-500/60 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30";

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2 tracking-tight">
            AI Image Generation
          </h1>
          <p className="text-muted-foreground">
            Create stunning images from text descriptions using AI
          </p>
        </div>

        <GenerationsBadge
          status={generations}
          loading={generationsLoading}
          authenticated={authenticated}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleGenerate} className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label
              htmlFor="image-prompt"
              className="text-sm font-medium text-foreground mb-3 block"
            >
              Prompt
            </label>
            <textarea
              id="image-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to create..."
              className="w-full h-32 bg-background/50 border border-blue-500/30 rounded-xl p-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500/60 smooth"
            />
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label
              htmlFor="image-style"
              className="text-sm font-medium text-foreground mb-3 block"
            >
              Style
            </label>
            <Select value={selectedStyle} onValueChange={setSelectedStyle}>
              <SelectTrigger id="image-style" className={triggerClasses}>
                <SelectValue placeholder="Select style" />
              </SelectTrigger>
              <SelectContent>
                {stylePresets.map((style) => (
                  <SelectItem key={style.id} value={style.id}>
                    {style.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label
              htmlFor="image-ratio"
              className="text-sm font-medium text-foreground mb-3 block"
            >
              Aspect Ratio
            </label>
            <Select value={selectedRatio} onValueChange={setSelectedRatio}>
              <SelectTrigger id="image-ratio" className={triggerClasses}>
                <SelectValue placeholder="Select aspect ratio" />
              </SelectTrigger>
              <SelectContent>
                {aspectRatios.map((ratio) => (
                  <SelectItem key={ratio.id} value={ratio.id}>
                    {ratio.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            disabled={
              !prompt.trim() ||
              isGenerating ||
              !authenticated ||
              noGenerationsLeft
            }
            className="w-full h-12 bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium smooth shadow-lg shadow-blue-500/25 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5 mr-2" />
                Generate
              </>
            )}
          </Button>

          {!authenticated && (
            <p className="text-sm text-red-400 text-center">
              Please sign in to generate images.
            </p>
          )}

          {noGenerationsLeft && (
            <p className="text-sm text-red-400 text-center">
              You&apos;ve reached your generation limit. Upgrade your plan to keep
              creating.
            </p>
          )}

          {errorMessage && (
            <p className="text-sm text-red-400 text-center">{errorMessage}</p>
          )}
        </form>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 min-h-[400px]">
            <h3 className="text-lg font-medium text-foreground mb-4">
              Generated Images
            </h3>
            {generatedImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {generatedImages.map((img, index) => (
                  <div
                    key={index}
                    className="relative group rounded-xl overflow-hidden border border-blue-500/20 cursor-pointer aspect-square bg-black/40 flex items-center justify-center"
                    onClick={() => setLightboxImage(img)}
                  >
                    <img
                      src={img}
                      alt={`Generated ${index + 1}`}
                      className="max-w-full max-h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 smooth flex items-center justify-center gap-3">
                      <Button
                        size="sm"
                        className="bg-white text-black hover:bg-white/90 rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                        asChild
                      >
                        <a href={img} download target="_blank" rel="noreferrer">
                          <Download className="w-4 h-4 mr-1" />
                          Download
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <ImageIcon className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No images generated yet
                </h3>
                <p className="text-muted-foreground max-w-sm">
                  Enter a prompt and click generate to create AI-powered images
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <h3 className="text-lg font-medium text-foreground mb-4">
              Previous Generations
            </h3>
            {history.length > 0 ? (
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth group"
                  >
                    <img
                      src={item.images[0]}
                      alt={item.prompt}
                      className="w-16 h-16 rounded-lg object-cover shrink-0 cursor-pointer hover:opacity-80 smooth"
                      onClick={() => setLightboxImage(item.images[0])}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {item.prompt}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {stylePresets.find((s) => s.id === item.style)?.label}{" "}
                        | {item.ratio} | {item.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={item.images[0]}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeFromHistory(item.id)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No previous generations
              </p>
            )}
          </div>
        </div>
      </div>

      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-6 right-6 p-2 text-white/70 hover:text-white smooth"
          >
            <X className="w-8 h-8" />
          </button>
          <div
            className="relative max-w-4xl max-h-[85vh] mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage}
              alt="Generated image"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-blue-500/30"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <Button
                className="bg-white text-black hover:bg-white/90 rounded-xl shadow-lg"
                asChild
              >
                <a href={lightboxImage} download target="_blank" rel="noreferrer">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
