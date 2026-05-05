"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ImageIcon, Loader2, Mic, Video, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/auth-provider";
import { useGenerations as useGenerationHistory } from "@/lib/use-generations";
import { useGenerations as useGenerationQuota } from "@/hooks/use-generations";
import { ProfileGenerationsQuota } from "@/components/profile-generations-quota";
import type { SttHistory, TabValue } from "@/lib/generations-types";
import { VideoSection } from "@/components/generations/video-section";
import { ImageSection } from "@/components/generations/image-section";
import { TtsSection } from "@/components/generations/tts-section";
import { SttSection } from "@/components/generations/stt-section";
import { VideoLightbox, ImageLightbox } from "@/components/generations/lightbox";
import { TranscriptDialog } from "@/components/generations/transcript-dialog";

const TAB_TRIGGER_CLASS =
  "h-9 rounded-md border border-transparent text-xs font-medium sm:text-sm px-2 sm:px-3 text-primary/80 transition-colors hover:text-primary data-[state=active]:border-primary/30 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=active]:shadow-sm dark:data-[state=active]:bg-primary/15";

function isValidTab(value: string): value is TabValue {
  return value === "image" || value === "video" || value === "tts" || value === "stt";
}

export function ProfileGenerations() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab = useMemo<TabValue>(() => {
    const tab = searchParams.get("tab") ?? "";
    return isValidTab(tab) ? tab : "image";
  }, [searchParams]);

  const handleTabChange = useCallback(
    (value: string) => {
      if (!isValidTab(value)) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const { videoItems, imageItems, ttsItems, sttItems, loading, error, deleteError, reload, removeRecord } =
    useGenerationHistory();
  const {
    status: quotaStatus,
    loading: quotaLoading,
    error: quotaError,
    refresh: refreshQuota,
  } = useGenerationQuota();

  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [transcriptItem, setTranscriptItem] = useState<SttHistory | null>(null);

  if (!user) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-6 py-12 text-center">
        <p className="mb-4 text-[13px] text-muted-foreground">
          Sign in to see your image and video generations.
        </p>
        <Button asChild size="sm">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  const pageIntro = (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        My generations
      </h1>
      <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        Image, video, and audio outputs from AI tools. Open any generator from the catalog sidebar.
      </p>
    </div>
  );

  const quotaBlock = (
    <ProfileGenerationsQuota
      status={quotaStatus}
      loading={quotaLoading}
      error={quotaError}
      onRefresh={refreshQuota}
    />
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {pageIntro}
        {quotaBlock}
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mr-3" />
          Loading generations…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {pageIntro}
        {quotaBlock}
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center">
          <p className="mb-4 text-[13px] text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="border-primary/45 text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
            onClick={reload}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pageIntro}
      {quotaBlock}

      {deleteError ? (
        <p className="text-sm text-red-400 text-center">{deleteError}</p>
      ) : null}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-primary/20 bg-primary/6 p-1 sm:grid-cols-4 dark:bg-primary/10">
          <TabsTrigger value="image" className={TAB_TRIGGER_CLASS}>
            <ImageIcon className="w-4 h-4 mr-2" />
            Images
          </TabsTrigger>
          <TabsTrigger value="video" className={TAB_TRIGGER_CLASS}>
            <Video className="w-4 h-4 mr-2" />
            Video
          </TabsTrigger>
          <TabsTrigger value="tts" className={TAB_TRIGGER_CLASS}>
            <Volume2 className="w-4 h-4 mr-2" />
            Text to Speech
          </TabsTrigger>
          <TabsTrigger value="stt" className={TAB_TRIGGER_CLASS}>
            <Mic className="w-4 h-4 mr-2" />
            Speech to Text
          </TabsTrigger>
        </TabsList>

        <TabsContent value="image" className="mt-3">
          <ImageSection
            items={imageItems}
            onPreview={setLightboxImage}
            onRemove={(id) => void removeRecord(id, "image")}
          />
        </TabsContent>
        <TabsContent value="video" className="mt-3">
          <VideoSection
            items={videoItems}
            onPlay={setLightboxVideo}
            onRemove={(id) => void removeRecord(id, "video")}
          />
        </TabsContent>
        <TabsContent value="tts" className="mt-3">
          <TtsSection
            items={ttsItems}
            onRemove={(id) => void removeRecord(id, "tts")}
          />
        </TabsContent>
        <TabsContent value="stt" className="mt-3">
          <SttSection
            items={sttItems}
            onViewTranscript={setTranscriptItem}
            onRemove={(id) => void removeRecord(id, "stt")}
          />
        </TabsContent>
      </Tabs>

      {lightboxVideo && (
        <VideoLightbox url={lightboxVideo} onClose={() => setLightboxVideo(null)} />
      )}
      {lightboxImage && (
        <ImageLightbox url={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
      <TranscriptDialog
        item={transcriptItem}
        onClose={() => setTranscriptItem(null)}
      />
    </div>
  );
}
