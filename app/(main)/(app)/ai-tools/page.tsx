import type { Metadata } from "next";
import { AiToolsPage } from "@/components/ai-tools-page";
import { getAiToolsPreviews } from "@/lib/ai-tools-previews";

export const metadata: Metadata = {
  title: "AI Video, Image & Voice Generator — Motion Flow",
  description:
    "Generate videos from text, create images in any style, clone voices, and transcribe audio — 6 AI tools in one subscription. No Midjourney or ElevenLabs needed.",
  alternates: { canonical: "/ai-tools" },
  openGraph: {
    title: "AI Video, Image & Voice Generator — Motion Flow",
    description:
      "6 AI creative tools in one subscription: VideoGen, ImageGen, ImageEdit, SvgGen, VoiceGen, SpeechToText. Commercial license included.",
    type: "website",
    url: "https://motionflow.pro/ai-tools",
  },
};

const schemaJsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Motion Flow AI Tools",
  description: "AI-powered creative tools for video creators and designers",
  url: "https://motionflow.pro/ai-tools",
  numberOfItems: 6,
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      item: {
        "@type": "SoftwareApplication",
        name: "VideoGen — AI Video Generator",
        description: "Generate cinematic quality videos from static images and text prompts.",
        url: "https://motionflow.pro/video-generation",
        applicationCategory: "MultimediaApplication",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
      },
    },
    {
      "@type": "ListItem",
      position: 2,
      item: {
        "@type": "SoftwareApplication",
        name: "ImageGen — AI Image Generator",
        description: "Create unique visuals in diverse styles with simple text prompts.",
        url: "https://motionflow.pro/image-generation",
        applicationCategory: "MultimediaApplication",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
      },
    },
    {
      "@type": "ListItem",
      position: 3,
      item: {
        "@type": "SoftwareApplication",
        name: "ImageEdit — AI Image Editor",
        description: "Remove backgrounds, erase objects and refine images effortlessly.",
        url: "https://motionflow.pro/image-edit",
        applicationCategory: "MultimediaApplication",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
      },
    },
    {
      "@type": "ListItem",
      position: 4,
      item: {
        "@type": "SoftwareApplication",
        name: "SvgGen — AI SVG Generator",
        description: "Generate crisp vector graphics, icons and illustrations as ready-to-use SVG files.",
        url: "https://motionflow.pro/svg-generation",
        applicationCategory: "DesignApplication",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
      },
    },
    {
      "@type": "ListItem",
      position: 5,
      item: {
        "@type": "SoftwareApplication",
        name: "VoiceGen — AI Text to Speech",
        description: "Turn your text into professional voiceovers and let AI do the talking.",
        url: "https://motionflow.pro/text-to-speech",
        applicationCategory: "MultimediaApplication",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
      },
    },
    {
      "@type": "ListItem",
      position: 6,
      item: {
        "@type": "SoftwareApplication",
        name: "SpeechToText — AI Transcription",
        description: "Convert audio recordings into accurate text in multiple languages.",
        url: "https://motionflow.pro/speech-to-text",
        applicationCategory: "MultimediaApplication",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
      },
    },
  ],
};

export default async function Page() {
  const previews = await getAiToolsPreviews();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJsonLd) }}
      />
      <AiToolsPage previews={previews} />
    </>
  );
}
