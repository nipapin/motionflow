import { Metadata } from "next";
import { SpeechToTextPage } from "@/components/speech-to-text-page";

export const metadata: Metadata = {
  title: "Speech to Text - AI Transcription | Motion Flow",
  description: "Convert audio recordings and files into accurate text transcriptions. Support for multiple languages and output formats.",
  keywords: ["speech to text", "AI transcription", "STT", "audio transcription", "voice recognition", "Motion Flow"],
  openGraph: {
    title: "Speech to Text - AI Transcription | Motion Flow",
    description: "Convert audio recordings and files into accurate text transcriptions.",
  },
};

export default function SpeechToTextRoute() {
  return <SpeechToTextPage />;
}
