"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";

const allowed = [
  "Use in personal and commercial projects (videos, films, ads, social media, presentations).",
  "Modify, edit, and adapt downloaded templates and assets to fit your projects.",
  "Use in client work and projects created for third parties.",
  "Use in monetized content on platforms like YouTube, TikTok, Instagram, etc.",
  "Use AI-generated outputs (images, video, audio) in your creative projects.",
  "Combine Motion Flow assets with other media in your productions.",
];

const notAllowed = [
  "Redistribute, resell, or share downloaded files as standalone assets.",
  "Upload raw templates or assets to other marketplaces or stock platforms.",
  "Claim authorship or ownership of Motion Flow templates or original assets.",
  "Use assets in projects that are illegal, defamatory, or infringe third-party rights.",
  "Build competing template/asset libraries using our content.",
  "Share your account or allow multiple users to access a single-user subscription.",
];

const sections = [
  {
    title: "1. License Grant",
    content:
      "When you download content from Motion Flow with an active subscription, you are granted a non-exclusive, worldwide, perpetual license to use that content in your projects. This license is non-transferable and subject to the restrictions outlined below.",
  },
  {
    title: "2. Scope of Use",
    content:
      "Your license covers use in an unlimited number of personal and commercial projects. There is no limit on the number of end products you can create using licensed content. Each downloaded asset may be used across multiple projects.",
  },
  {
    title: "3. AI-Generated Content",
    content:
      "Outputs generated through our AI tools (image generation, video generation, text-to-speech, speech-to-text) are licensed under the same terms as other platform content. You receive a non-exclusive license to use these outputs in your projects. AI-generated content may not be unique, and similar outputs may be generated for other users.",
  },
  {
    title: "4. Attribution",
    content:
      "Attribution is not required, but is always appreciated. If you'd like to credit Motion Flow, you can link back to motionflow.studio.",
  },
  {
    title: "5. License Duration",
    content:
      "Licenses for content downloaded during an active subscription are perpetual — they do not expire even if you cancel your subscription. However, you may only download new content while your subscription is active.",
  },
  {
    title: "6. Warranty Disclaimer",
    content:
      "Content is provided \"as is\" without warranties of any kind. Motion Flow does not guarantee that content is free from third-party claims. You are responsible for ensuring your use of content complies with applicable laws.",
  },
];

export default function LicensePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-3xl mx-auto px-6 py-12">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-12"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 tracking-tight">
            License Agreement
          </h1>
          <p className="text-muted-foreground text-sm">
            Effective date: April 16, 2025
          </p>
        </div>

        <div className="space-y-10">
          <p className="text-muted-foreground leading-relaxed">
            This License Agreement describes what you can and cannot do with
            content downloaded from Motion Flow. By downloading any asset, you
            agree to these terms.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-emerald-500/20 bg-card/80 backdrop-blur-sm p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                What you CAN do
              </h3>
              <ul className="space-y-3">
                {allowed.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-muted-foreground"
                  >
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-red-500/20 bg-card/80 backdrop-blur-sm p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                  <X className="w-3.5 h-3.5 text-red-400" />
                </div>
                What you CANNOT do
              </h3>
              <ul className="space-y-3">
                {notAllowed.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-muted-foreground"
                  >
                    <X className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-xl font-semibold text-foreground mb-4">
                {section.title}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {section.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
