import { Metadata } from "next";
import { TextToSpeechPage } from "@/components/text-to-speech-page";

export const metadata: Metadata = {
  title: "Text to Speech - AI Voice Generator | Motion Flow",
  description: "Convert text into natural-sounding speech with AI-powered voices. Choose from multiple languages, accents, and speaking styles.",
  keywords: ["text to speech", "AI voice", "TTS", "voice generator", "speech synthesis", "Motion Flow"],
  openGraph: {
    title: "Text to Speech - AI Voice Generator | Motion Flow",
    description: "Convert text into natural-sounding speech with AI-powered voices.",
  },
};

export default function TextToSpeechRoute() {
  return <TextToSpeechPage />;
}
