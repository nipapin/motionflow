import { Metadata } from "next";
import { ImageEditorPage } from "@/components/image-editor-page";

export const metadata: Metadata = {
  title: "Image Edit | Motion Flow",
  description:
    "Edit and combine images with AI using natural-language instructions.",
  keywords: [
    "Image Edit",
    "image editing",
    "inpainting",
    "multi-image edit",
    "AI tools",
  ],
  openGraph: {
    title: "Image Edit | Motion Flow",
    description: "Edit and combine images with AI.",
    type: "website",
  },
};

export default function ImageEditPage() {
  return <ImageEditorPage />;
}
