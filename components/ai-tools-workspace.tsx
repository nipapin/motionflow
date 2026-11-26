"use client";

import { useEffect, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { ImageIcon, Wand2, Clapperboard, Mic, AudioLines, PenTool, MoreHorizontal, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AiWorkspaceActiveContext, AiWorkspaceQuotaContext } from "@/components/ai-workspace-context";
import "@/components/ai-tools-workspace.css";

const loading = () => <div className="h-52 animate-pulse rounded-3xl border border-blue-500/20 bg-background bg-linear-to-br from-blue-500/5 to-transparent" aria-label="Loading tool" />;
const ImageGenerator = dynamic(() => import("./image-generator").then(m => m.ImageGenerator), { loading });
const ImageEditor = dynamic(() => import("./image-editor").then(m => m.ImageEditor), { loading });
const VideoGenerator = dynamic(() => import("./video-generator").then(m => m.VideoGenerator), { loading });
const TextToSpeech = dynamic(() => import("./text-to-speech").then(m => m.TextToSpeech), { loading });
const SpeechToText = dynamic(() => import("./speech-to-text").then(m => m.SpeechToText), { loading });
const SvgGenerator = dynamic(() => import("./svg-generator").then(m => m.SvgGenerator), { loading });

const tools = [
  { id: "image", label: "Image", icon: ImageIcon, component: ImageGenerator },
  { id: "edit", label: "Edit", icon: Wand2, component: ImageEditor },
  { id: "video", label: "Video", icon: Clapperboard, component: VideoGenerator },
  { id: "voice", label: "Voice", icon: Mic, component: TextToSpeech },
  { id: "transcribe", label: "Transcribe", icon: AudioLines, component: SpeechToText },
  { id: "graphic", label: "Graphic", icon: PenTool, component: SvgGenerator },
] as const;

export type AiWorkspaceTool = (typeof tools)[number]["id"];

/** Keep visited tools mounted so prompts, uploads and in-flight work survive switching. */
export function AiToolsWorkspace({ initialTool = "image" }: { initialTool?: AiWorkspaceTool }) {
  const [active, setActive] = useState<AiWorkspaceTool>(initialTool);
  const [visited, setVisited] = useState<AiWorkspaceTool[]>([initialTool]);

  useEffect(() => {
    // Old tool URLs still select their initial tool, but share one visible address.
    if (window.location.pathname !== "/ai-tools" || window.location.search || window.location.hash) {
      window.history.replaceState(window.history.state, "", "/ai-tools");
    }
  }, []);

  const selectTool = (id: AiWorkspaceTool) => {
    setActive(id);
    setVisited(previous => previous.includes(id) ? previous : [...previous, id]);
  };
  const extraToolActive = tools.slice(3).some(tool => tool.id === active);
  const tabClasses = "group flex h-22 min-w-0 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:h-24 md:w-24 md:shrink-0 md:text-sm";
  const activeClasses = "bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25";
  const inactiveClasses = "text-muted-foreground hover:bg-foreground/5 hover:text-foreground";

  return (
    <section className="ai-workspace w-full pt-5 sm:pt-10">
      <AiWorkspaceQuotaContext.Provider value={null}>
        <div className="mx-auto w-full max-w-5xl">
        <div className="mb-7 text-center sm:mb-9">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Your next great idea is{" "}
            <span className="bg-linear-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
              generated
            </span>{" "}
            here.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Turn your imagination into images, videos, and sound. Pick a tool and start creating.
          </p>
        </div>

        <div className="mb-8 flex justify-center sm:mb-10">
          <div role="tablist" aria-label="AI tools" className="grid w-full max-w-full grid-cols-4 gap-1 p-1 md:flex md:w-auto md:gap-3">
            {tools.map(({ id, label, icon: Icon }, index) => (
              <button key={id} type="button" role="tab" id={`ai-tab-${id}`} aria-selected={active === id} aria-controls={`ai-panel-${id}`} tabIndex={active === id ? 0 : -1}
                onClick={() => selectTool(id)}
                onKeyDown={event => {
                  const mobile = window.matchMedia("(max-width: 767px)").matches;
                  const count = mobile ? 4 : tools.length;
                  let next = index;
                  if (event.key === "ArrowRight") next = (index + 1) % count;
                  else if (event.key === "ArrowLeft") next = (index - 1 + count) % count;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = count - 1;
                  else return;
                  event.preventDefault();
                  if (mobile && next === 3) {
                    document.getElementById("ai-tools-more")?.focus();
                    return;
                  }
                  selectTool(tools[next].id);
                  document.getElementById(`ai-tab-${tools[next].id}`)?.focus();
                }}
                className={cn(tabClasses, index >= 3 && "hidden md:flex", active === id ? activeClasses : inactiveClasses)}
              >
                <Icon className="size-5 sm:size-6" strokeWidth={1.6} aria-hidden />
                {label}
              </button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button id="ai-tools-more" type="button" aria-label="More AI tools" className={cn(tabClasses, "md:hidden", extraToolActive ? activeClasses : inactiveClasses)}
                  onKeyDown={event => {
                    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
                    event.preventDefault();
                    const id = event.key === "ArrowLeft" ? "video" : "image";
                    selectTool(id);
                    document.getElementById(`ai-tab-${id}`)?.focus();
                  }}
                >
                  <MoreHorizontal className="size-5" strokeWidth={1.6} aria-hidden />
                  More
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44 rounded-2xl border-blue-500/30 bg-popover p-2 shadow-xl md:hidden">
                {tools.slice(3).map(({ id, label, icon: Icon }) => (
                  <DropdownMenuItem key={id} onSelect={() => selectTool(id)} className="gap-3 rounded-xl px-3 py-3">
                    <Icon className="size-4" aria-hidden />
                    {label}
                    {active === id && <Check className="ml-auto size-4 text-blue-400" aria-label="Selected" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {tools.map(({ id, component }) => {
          const Tool: ComponentType = component;
          return (
            <div key={id} role="tabpanel" id={`ai-panel-${id}`} aria-labelledby={`ai-tab-${id}`} hidden={active !== id} tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50">
              <AiWorkspaceActiveContext.Provider value={active === id}>
                {visited.includes(id) && <Tool />}
              </AiWorkspaceActiveContext.Provider>
            </div>
          );
        })}
        </div>
      </AiWorkspaceQuotaContext.Provider>
    </section>
  );
}
