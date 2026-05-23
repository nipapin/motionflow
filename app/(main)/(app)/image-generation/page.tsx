import { Metadata } from "next";
import { ImageGeneratorPage } from "@/components/image-generator-page";

export const metadata: Metadata = {
  title: "AI Image Generation | Motion Flow",
  description: "Generate stunning images with AI. Create photorealistic, anime, digital art, and 3D rendered images from text prompts.",
  keywords: ["AI image generation", "text to image", "AI art", "image generator", "AI tools"],
  openGraph: {
    title: "AI Image Generation | Motion Flow",
    description: "Generate stunning images with AI. Create photorealistic, anime, digital art, and 3D rendered images.",
    type: "website",
  },
};

export default function ImageGenerationPage() {
  return <ImageGeneratorPage />;
}
