"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, Music, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
const categories = [
  { name: "After Effects", label: "After Effects", text: "Ae", gradient: "from-purple-600 via-indigo-500 to-blue-500", href: "/after-effects" },
  { name: "Premiere Pro", label: "Premiere Pro", text: "Pr", gradient: "from-purple-600 via-violet-500 to-fuchsia-500", href: "/premiere-pro" },
  { name: "DaVinci Resolve", label: "DaVinci Resolve", text: "Dr", gradient: "from-orange-500 via-red-500 to-rose-500", href: "/davinci-resolve" },
  { name: "Stock Music", label: "Stock Music", icon: Music, gradient: "from-emerald-500 via-teal-500 to-cyan-500", href: "/stock-audio" },
  { name: "Sound FX", label: "Sound FX", icon: AudioLines, gradient: "from-blue-500 via-cyan-500 to-teal-500", href: "/sound-fx" },
  { name: "AI tools", label: "AI tools", text: "AI", gradient: "from-amber-500 via-orange-500 to-yellow-500", href: "/ai-tools" },
];

interface HeroBannerProps {
  onCategoryChange: (category: string) => void;
}

export function HeroBanner({ onCategoryChange }: HeroBannerProps) {
  return (
    <div className="relative rounded-3xl overflow-hidden bg-linear-to-br from-card via-card to-primary/5 border border-blue-500/20 mb-10 glow">
      {/* Colorful gradient overlays */}
      <div className="absolute inset-0 bg-linear-to-tr from-blue-500/5 via-transparent to-purple-500/5" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-linear-to-bl from-blue-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-linear-to-tr from-cyan-500/10 to-transparent rounded-full blur-3xl" />
      
      <div className="relative flex flex-col gap-10 p-8 lg:p-10 xl:flex-row xl:p-14">
        <div className="flex-1 flex flex-col justify-center text-center xl:text-left">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-foreground/5 text-foreground mb-6 w-fit mx-auto xl:mx-0 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Unlimited Downloads
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-semibold text-foreground mb-5 tracking-tight leading-[1.1] text-balance">
            Create stunning videos <br/> with premium templates
          </h1>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto xl:mx-0 text-pretty text-lg leading-relaxed">
            Access thousands of professionally crafted templates for After Effects, Premiere Pro, and DaVinci Resolve.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center xl:justify-start">
            <Button 
              size="lg" 
              asChild
              className="bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-full px-8 h-12 text-sm font-medium smooth hover-lift shadow-lg shadow-blue-500/25"
            >
              <Link href="/after-effects">
                Explore All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="ghost" 
              asChild
              className="text-foreground hover:bg-foreground/5 rounded-full px-8 h-12 text-sm font-medium smooth border border-blue-500/30 hover:border-blue-500/50"
            >
              <Link href="/ai-tools">
                <Sparkles className="w-4 h-4 mr-2" />
                AI Tools
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center xl:justify-end w-full xl:w-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 w-full sm:w-auto">
            {categories.map((cat) => (
              <Link
                key={cat.name}
                href={cat.href}
                className="group flex flex-col items-center justify-center gap-3 sm:gap-4 w-full sm:w-36 h-32 sm:h-36 xl:w-40 xl:h-40 rounded-2xl border border-blue-500/30 hover:border-2 hover:border-blue-500 bg-background/50 hover:bg-background/70 smooth hover-lift cursor-pointer"
              >
                <div className={cn(
                  "w-10 h-10 sm:w-12 sm:h-12 xl:w-14 xl:h-14 rounded-sm flex items-center justify-center bg-linear-to-br smooth group-hover:rounded-xl group-hover:scale-120 shadow-lg",
                  cat.gradient
                )}>
                  {cat.text ? (
                    <span className="text-base sm:text-lg xl:text-xl font-bold text-white drop-shadow-md">{cat.text}</span>
                  ) : cat.icon ? (
                    <cat.icon className="w-5 h-5 sm:w-6 sm:h-6 xl:w-7 xl:h-7 text-white drop-shadow-md" />
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

    </div>
  );
}
