import { Metadata } from "next";
import { SvgGeneratorPage } from "@/components/svg-generator-page";

export const metadata: Metadata = {
  title: "AI SVG Generation | Motion Flow",
  description:
    "Generate crisp vector graphics, icons and illustrations as SVG files from text prompts.",
  keywords: [
    "AI SVG generation",
    "text to SVG",
    "AI vector graphics",
    "AI icon generator",
    "vector illustration AI",
    "AI tools",
  ],
  openGraph: {
    title: "AI SVG Generation | Motion Flow",
    description:
      "Generate crisp vector graphics, icons and illustrations as SVG files from text prompts.",
    type: "website",
  },
};

export default function SvgGenerationPage() {
  return <SvgGeneratorPage />;
}
