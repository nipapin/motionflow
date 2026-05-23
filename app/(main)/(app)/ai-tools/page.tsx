import { Metadata } from "next";
import { AiToolsPage } from "@/components/ai-tools-page";
import { getAiToolsPreviews } from "@/lib/ai-tools-previews";

export const metadata: Metadata = {
  title: "Generative AI tools | Motion Flow",
  description:
    "Explore Motion Flow generative AI tools: ImageGen, ImageEdit, VideoGen, VoiceGen, and SpeechToText — included in your subscription.",
  keywords: [
    "AI tools",
    "AI image generation",
    "AI video generation",
    "text to speech",
    "speech to text",
    "image editing",
  ],
  openGraph: {
    title: "Generative AI tools | Motion Flow",
    description:
      "Explore ImageGen, VideoGen, VoiceGen, and more — powerful AI tools in one workspace.",
    type: "website",
  },
};

export default async function Page() {
  const previews = await getAiToolsPreviews();
  return <AiToolsPage previews={previews} />;
}
