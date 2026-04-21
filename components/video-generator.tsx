"use client";

import { useState } from "react";
import { Video, Download, RefreshCw, Play, Pause, Clock, Film, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGenerations } from "@/hooks/use-generations";
import { GenerationsBadge } from "@/components/generations-badge";

const durationOptions = [
  { id: "3s", label: "3 sec" },
  { id: "5s", label: "5 sec" },
  { id: "10s", label: "10 sec" },
];

const qualityOptions = [
  { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p" },
  { id: "4k", label: "4K" },
];

const stylePresets = [
  { id: "cinematic", label: "Cinematic" },
  { id: "anime", label: "Anime" },
  { id: "realistic", label: "Realistic" },
  { id: "artistic", label: "Artistic" },
];

interface VideoHistory {
  id: string;
  prompt: string;
  style: string;
  duration: string;
  quality: string;
  thumbnail: string;
  timestamp: Date;
}

const mockHistory: VideoHistory[] = [
  {
    id: "1",
    prompt: "A drone shot flying over mountains at sunset",
    style: "cinematic",
    duration: "5s",
    quality: "1080p",
    thumbnail: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=256&h=144&fit=crop",
    timestamp: new Date(Date.now() - 3600000),
  },
  {
    id: "2",
    prompt: "Ocean waves crashing on a rocky shore",
    style: "realistic",
    duration: "3s",
    quality: "1080p",
    thumbnail: "https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=256&h=144&fit=crop",
    timestamp: new Date(Date.now() - 86400000),
  },
  {
    id: "3",
    prompt: "A samurai walking through cherry blossoms",
    style: "anime",
    duration: "5s",
    quality: "720p",
    thumbnail: "https://images.unsplash.com/photo-1522383225653-ed111181a951?w=256&h=144&fit=crop",
    timestamp: new Date(Date.now() - 172800000),
  },
];

export function VideoGenerator() {
  const {
    status: generations,
    loading: generationsLoading,
    authenticated,
    consume,
  } = useGenerations();

  const [prompt, setPrompt] = useState("");
  const [selectedDuration, setSelectedDuration] = useState("5s");
  const [selectedQuality, setSelectedQuality] = useState("1080p");
  const [selectedStyle, setSelectedStyle] = useState("cinematic");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [history, setHistory] = useState<VideoHistory[]>(mockHistory);
  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const remaining = generations?.remaining ?? 0;
  const noGenerationsLeft =
    authenticated && !generationsLoading && remaining <= 0;

  const handleGenerate = async () => {
    setErrorMessage(null);
    if (!prompt.trim() || !authenticated || noGenerationsLeft) return;

    setIsGenerating(true);

    try {
      await consume("video");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start generation",
      );
      setIsGenerating(false);
      return;
    }

    setTimeout(() => {
      const newVideo = "https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800&h=450&fit=crop";
      setGeneratedVideo(newVideo);

      setHistory(prev => [{
        id: Date.now().toString(),
        prompt,
        style: selectedStyle,
        duration: selectedDuration,
        quality: selectedQuality,
        thumbnail: newVideo,
        timestamp: new Date(),
      }, ...prev]);

      setIsGenerating(false);
    }, 3000);
  };

  const removeFromHistory = (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2 tracking-tight">AI Video Generation</h1>
          <p className="text-muted-foreground">Create stunning videos from text descriptions using AI</p>
        </div>
        
        <GenerationsBadge
          status={generations}
          loading={generationsLoading}
          authenticated={authenticated}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Controls */}
        <div className="lg:col-span-1 space-y-6">
          {/* Prompt Input */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 block">Video Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the video you want to create... (e.g., 'A drone shot flying over mountains at sunset')"
              className="w-full h-32 bg-background/50 border border-blue-500/30 rounded-xl p-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500/60 smooth"
            />
          </div>

          {/* Style */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 block">Style</label>
            <div className="grid grid-cols-2 gap-2">
              {stylePresets.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedStyle(style.id)}
                  className={cn(
                    "px-3 py-2.5 rounded-xl text-sm font-medium smooth border",
                    selectedStyle === style.id
                      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white border-transparent shadow-lg shadow-blue-500/25"
                      : "bg-background/50 text-muted-foreground hover:text-foreground border-blue-500/20 hover:border-blue-500/40"
                  )}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              Duration
            </label>
            <div className="flex gap-2">
              {durationOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedDuration(option.id)}
                  className={cn(
                    "flex-1 px-3 py-2.5 rounded-xl text-sm font-medium smooth border flex flex-col items-center gap-1",
                    selectedDuration === option.id
                      ? "bg-blue-500/10 border-blue-500/50 text-foreground"
                      : "bg-background/50 border-blue-500/20 text-muted-foreground hover:border-blue-500/40"
                  )}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quality */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Film className="w-4 h-4 text-blue-400" />
              Quality
            </label>
            <div className="flex gap-2">
              {qualityOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedQuality(option.id)}
                  className={cn(
                    "flex-1 px-3 py-2.5 rounded-xl text-sm font-medium smooth border flex flex-col items-center gap-1",
                    selectedQuality === option.id
                      ? "bg-blue-500/10 border-blue-500/50 text-foreground"
                      : "bg-background/50 border-blue-500/20 text-muted-foreground hover:border-blue-500/40"
                  )}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={
              !prompt.trim() ||
              isGenerating ||
              !authenticated ||
              noGenerationsLeft
            }
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium smooth shadow-lg shadow-blue-500/25 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Generating Video...
              </>
            ) : (
              <>
                <Video className="w-5 h-5 mr-2" />
                Generate Video
              </>
            )}
          </Button>

          {!authenticated && (
            <p className="text-sm text-red-400 text-center">
              Please sign in to generate videos.
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

          {isGenerating && (
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-sm text-foreground font-medium">Processing...</span>
              </div>
              <p className="text-xs text-muted-foreground">This may take a few minutes depending on the video duration and quality selected.</p>
            </div>
          )}
        </div>

        {/* Right Panel - Generated Video & History */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 min-h-[350px]">
            <h3 className="text-lg font-medium text-foreground mb-4">Generated Video</h3>
            {generatedVideo ? (
              <div className="space-y-4">
                <div 
                  className="relative rounded-xl overflow-hidden border border-blue-500/20 aspect-video bg-black cursor-pointer"
                  onClick={() => setLightboxVideo(generatedVideo)}
                >
                  <img src={generatedVideo} alt="Generated video preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 smooth"
                    >
                      {isPlaying ? (
                        <Pause className="w-8 h-8 text-white" />
                      ) : (
                        <Play className="w-8 h-8 text-white ml-1" />
                      )}
                    </button>
                  </div>
                  {/* Progress bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div className="h-full bg-blue-500 w-1/3" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <span className="text-foreground font-medium">Duration:</span> {selectedDuration.replace('s', ' seconds')} | 
                    <span className="text-foreground font-medium ml-2">Quality:</span> {selectedQuality}
                  </div>
                  <Button className="bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-lg">
                    <Download className="w-4 h-4 mr-2" />
                    Download Video
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <Video className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No video generated yet</h3>
                <p className="text-muted-foreground max-w-sm">Enter a prompt and click generate to create AI-powered videos</p>
              </div>
            )}
          </div>

          {/* History */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <h3 className="text-lg font-medium text-foreground mb-4">Previous Generations</h3>
            {history.length > 0 ? (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth group">
                    <div 
                      className="relative w-24 h-14 rounded-lg overflow-hidden shrink-0 cursor-pointer hover:opacity-80 smooth"
                      onClick={() => setLightboxVideo(item.thumbnail)}
                    >
                      <img 
                        src={item.thumbnail} 
                        alt={item.prompt} 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{item.prompt}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {stylePresets.find(s => s.id === item.style)?.label} | {item.duration} | {item.quality} | {item.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                      >
                        <Download className="w-4 h-4" />
                      </button>
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
              <p className="text-sm text-muted-foreground text-center py-8">No previous generations</p>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxVideo && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxVideo(null)}
        >
          <button
            onClick={() => setLightboxVideo(null)}
            className="absolute top-6 right-6 p-2 text-white/70 hover:text-white smooth"
          >
            <X className="w-8 h-8" />
          </button>
          <div 
            className="relative max-w-5xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-video rounded-2xl overflow-hidden border border-blue-500/30 bg-black">
              <img 
                src={lightboxVideo} 
                alt="Generated video" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  type="button"
                  className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 smooth"
                >
                  <Play className="w-10 h-10 text-white ml-1" />
                </button>
              </div>
            </div>
            <div className="flex justify-center mt-4">
              <Button className="bg-white text-black hover:bg-white/90 rounded-xl shadow-lg">
                <Download className="w-4 h-4 mr-2" />
                Download Video
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
