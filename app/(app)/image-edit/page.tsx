import { Metadata } from "next";
import { ImageEditorPage } from "@/components/image-editor-page";

export const metadata: Metadata = {
  title: "AI Image Edit | Motion Flow",
  description:
    "Edit and combine images with AI using natural-language instructions.",
  keywords: [
    "AI image edit",
    "image editing",
    "inpainting",
    "multi-image edit",
    "AI tools",
  ],
  openGraph: {
    title: "AI Image Edit | Motion Flow",
    description: "Edit and combine images with AI.",
    type: "website",
  },
};

export default function ImageEditPage() {
  return <ImageEditorPage />;
}
