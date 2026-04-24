"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type {
  ApiGenerationRecord,
  ImageHistory,
  SttHistory,
  TabValue,
  TtsHistory,
  VideoHistory,
} from "@/lib/generations-types";
import {
  mapImageRecord,
  mapSttRecord,
  mapTtsRecord,
  mapVideoRecord,
} from "@/lib/generations-utils";

interface GenerationsState {
  videoItems: VideoHistory[];
  imageItems: ImageHistory[];
  ttsItems: TtsHistory[];
  sttItems: SttHistory[];
  loading: boolean;
  error: string | null;
  deleteError: string | null;
  reload: () => void;
  removeRecord: (id: string, tool: TabValue) => Promise<void>;
}

export function useGenerations(): GenerationsState {
  const { user } = useAuth();

  const [videoItems, setVideoItems] = useState<VideoHistory[]>([]);
  const [imageItems, setImageItems] = useState<ImageHistory[]>([]);
  const [ttsItems, setTtsItems] = useState<TtsHistory[]>([]);
  const [sttItems, setSttItems] = useState<SttHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [
        videoRes,
        imageRes,
        imageEditRes,
        imageRemoveBgRes,
        imageUpscaleRes,
        ttsRes,
        sttRes,
      ] = await Promise.all([
        fetch("/api/me/generation-records?tool=video&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=image&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=image_edit&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=image_remove_bg&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=image_upscale&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=tts&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/me/generation-records?tool=stt&limit=100", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      if (
        !videoRes.ok ||
        !imageRes.ok ||
        !imageEditRes.ok ||
        !imageRemoveBgRes.ok ||
        !imageUpscaleRes.ok ||
        !ttsRes.ok ||
        !sttRes.ok
      ) {
        throw new Error("Failed to load generations");
      }
      const [
        videoData,
        imageData,
        imageEditData,
        imageRemoveBgData,
        imageUpscaleData,
        ttsData,
        sttData,
      ] = (await Promise.all([
        videoRes.json(),
        imageRes.json(),
        imageEditRes.json(),
        imageRemoveBgRes.json(),
        imageUpscaleRes.json(),
        ttsRes.json(),
        sttRes.json(),
      ])) as Array<{ items?: ApiGenerationRecord[] }>;
      setVideoItems((videoData.items ?? []).map(mapVideoRecord));
      const imageRows = [
        ...(imageData.items ?? []),
        ...(imageEditData.items ?? []),
        ...(imageRemoveBgData.items ?? []),
        ...(imageUpscaleData.items ?? []),
      ].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setImageItems(imageRows.map(mapImageRecord));
      setTtsItems((ttsData.items ?? []).map(mapTtsRecord));
      setSttItems((sttData.items ?? []).map(mapSttRecord));
    } catch {
      setError("Could not load your generations. Try again later.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeRecord = useCallback(
    async (id: string, tool: TabValue) => {
      setDeleteError(null);
      try {
        const res = await fetch(`/api/me/generation-records/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("delete failed");
        if (tool === "video") {
          setVideoItems((prev) => prev.filter((h) => h.id !== id));
        } else if (tool === "image") {
          setImageItems((prev) => prev.filter((h) => h.id !== id));
        } else if (tool === "tts") {
          setTtsItems((prev) => prev.filter((h) => h.id !== id));
        } else {
          setSttItems((prev) => prev.filter((h) => h.id !== id));
        }
      } catch {
        setDeleteError("Could not remove this item.");
      }
    },
    [],
  );

  return {
    videoItems,
    imageItems,
    ttsItems,
    sttItems,
    loading,
    error,
    deleteError,
    reload: () => void load(),
    removeRecord,
  };
}
