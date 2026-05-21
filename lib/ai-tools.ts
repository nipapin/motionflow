import type { LucideIcon } from "lucide-react";
import { ImageIcon, MessageSquare, Mic, Video, Wand2 } from "lucide-react";

export type AiToolCategory = "Video" | "Image" | "Audio";

export type AiToolItem = {
  name: string;
  displayName: string;
  label: string;
  href: string;
  icon: LucideIcon;
  category: AiToolCategory;
  cardDescription: string;
  /** Pexels video search query for 16:9 card preview */
  pexelsQuery: string;
  previewFallback: string;
};

/** Display order matches Envato Labs hub (video → image → audio). */
export const AI_TOOLS: AiToolItem[] = [
  {
    name: "Video Gen",
    displayName: "VideoGen",
    label: "Video Gen",
    href: "/video-generation",
    icon: Video,
    category: "Video",
    cardDescription:
      "Generate cinematic quality videos from static images and text prompts.",
    pexelsQuery: "cinematic sports car driving",
    previewFallback: "from-slate-800 via-blue-900 to-cyan-900",
  },
  {
    name: "Image Gen",
    displayName: "ImageGen",
    label: "Image Gen",
    href: "/image-generation",
    icon: ImageIcon,
    category: "Image",
    cardDescription: "Create unique visuals in diverse styles with simple text prompts.",
    pexelsQuery: "fashion photography studio portrait",
    previewFallback: "from-violet-700 via-purple-700 to-fuchsia-700",
  },
  {
    name: "Image Edit",
    displayName: "ImageEdit",
    label: "Image Edit",
    href: "/image-edit",
    icon: Wand2,
    category: "Image",
    cardDescription: "Remove backgrounds, erase objects and refine images effortlessly.",
    pexelsQuery: "creative photo editing portrait",
    previewFallback: "from-amber-700 via-orange-700 to-rose-700",
  },
  {
    name: "Text to Speech",
    displayName: "VoiceGen",
    label: "Text to Speech",
    href: "/text-to-speech",
    icon: MessageSquare,
    category: "Audio",
    cardDescription: "Turn your text into professional voiceovers and let AI do the talking.",
    pexelsQuery: "podcast microphone recording studio",
    previewFallback: "from-emerald-800 via-teal-800 to-cyan-900",
  },
  {
    name: "Speech to Text",
    displayName: "SpeechToText",
    label: "Speech to Text",
    href: "/speech-to-text",
    icon: Mic,
    category: "Audio",
    cardDescription: "Convert audio recordings into accurate text in multiple languages.",
    pexelsQuery: "interview microphone transcription",
    previewFallback: "from-indigo-800 via-blue-900 to-slate-800",
  },
];

export const LABS_HERO_WORDS = ["content", "video", "music", "images", "voice"] as const;

export const LABS_CTA_IMAGES = [
  {
    src: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&h=600&fit=crop&q=80",
    alt: "Creative AI-generated concept",
  },
  {
    src: "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=600&h=600&fit=crop&q=80",
    alt: "Vibrant paint explosion",
  },
  {
    src: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=600&h=600&fit=crop&q=80",
    alt: "Colorful artwork",
  },
] as const;
