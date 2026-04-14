"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Play, Music, AudioLines, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
const categories = [
  { name: "After Effects", label: "After Effects", text: "Ae", gradient: "from-purple-600 via-indigo-500 to-blue-500", href: "/after-effects" },
  { name: "Premiere Pro", label: "Premiere Pro", text: "Pr", gradient: "from-purple-600 via-violet-500 to-fuchsia-500", href: "/premiere-pro" },
  { name: "DaVinci Resolve", label: "DaVinci Resolve", text: "Dr", gradient: "from-orange-500 via-red-500 to-rose-500", href: "/davinci-resolve" },
  { name: "Illustrator", label: "Illustrator", text: "Ai", gradient: "from-amber-500 via-orange-500 to-yellow-500", href: "/illustrator" },
  { name: "Stock Music", label: "Stock Music", icon: Music, gradient: "from-emerald-500 via-teal-500 to-cyan-500", href: "/stock-audio" },
  { name: "Sound FX", label: "Sound FX", icon: AudioLines, gradient: "from-blue-500 via-cyan-500 to-teal-500", href: "/sound-fx" },
];

interface HeroBannerProps {
  onCategoryChange: (category: string) => void;
}

export function HeroBanner({ onCategoryChange }: HeroBannerProps) {
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-card via-card to-primary/5 border border-blue-500/20 mb-10 glow">
      {/* Colorful gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/5 via-transparent to-purple-500/5" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-blue-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr from-cyan-500/10 to-transparent rounded-full blur-3xl" />
      
      <div className="relative flex flex-col lg:flex-row gap-10 p-8 lg:p-14">
        <div className="flex-1 flex flex-col justify-center text-center lg:text-left">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-foreground/5 text-foreground mb-6 w-fit mx-auto lg:mx-0 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Unlimited Downloads
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-semibold text-foreground mb-5 tracking-tight leading-[1.1] text-balance">
            Create stunning videos <br/> with premium templates
          </h1>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto lg:mx-0 text-pretty text-lg leading-relaxed">
            Access thousands of professionally crafted templates for After Effects, Premiere Pro, and DaVinci Resolve.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <Button 
              size="lg" 
              asChild
              className="bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-full px-8 h-12 text-sm font-medium smooth hover-lift shadow-lg shadow-blue-500/25"
            >
              <Link href="/after-effects">
                Explore All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="ghost" 
              onClick={() => setVideoOpen(true)}
              className="text-foreground hover:bg-foreground/5 rounded-full px-8 h-12 text-sm font-medium smooth border border-blue-500/30 hover:border-blue-500/50"
            >
              <Play className="w-4 h-4 mr-2" />
              Learn More
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center lg:justify-end w-full lg:w-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 w-full sm:w-auto">
            {categories.map((cat) => (
              <Link
                key={cat.name}
                href={cat.href}
                className="group flex flex-col items-center justify-center gap-3 sm:gap-4 w-full sm:w-36 lg:w-40 h-32 sm:h-36 lg:h-40 rounded-2xl border border-blue-500/30 hover:border-2 hover:border-blue-500 bg-background/50 hover:bg-background/70 smooth hover-lift cursor-pointer"
              >
                <div className={cn(
                  "w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center bg-gradient-to-br smooth group-hover:scale-110 shadow-lg",
                  cat.gradient
                )}>
                  {cat.text ? (
                    <span className="text-base sm:text-lg lg:text-xl font-bold text-white drop-shadow-md">{cat.text}</span>
                  ) : cat.icon ? (
                    <cat.icon className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white drop-shadow-md" />
                  ) : null}
                </div>
                <span className="text-xs sm:text-sm font-medium text-foreground smooth text-center leading-tight px-2">
                  {cat.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Video Modal */}
      {videoOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setVideoOpen(false)}
        >
          <div 
            className="relative w-full max-w-4xl mx-4 aspect-video rounded-2xl overflow-hidden border border-blue-500/30 bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setVideoOpen(false)}
              className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white smooth"
            >
              <X className="w-6 h-6" />
            </button>
            <iframe
              src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
              title="Video Player"
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  );
}
