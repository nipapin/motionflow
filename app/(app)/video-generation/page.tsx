import { Metadata } from "next";
import { VideoGeneratorPage } from "@/components/video-generator-page";

export const metadata: Metadata = {
  title: "AI Video Generation | Motion Flow",
  description: "Generate professional videos with AI. Create cinematic, animated, promotional, and documentary-style videos from text prompts.",
  keywords: ["AI video generation", "text to video", "AI video", "video generator", "AI tools"],
  openGraph: {
    title: "AI Video Generation | Motion Flow",
    description: "Generate professional videos with AI. Create cinematic, animated, and promotional videos.",
    type: "website",
  },
};

export default function VideoGenerationPage() {
  return <VideoGeneratorPage />;
}
