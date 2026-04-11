"use client";

import { useState } from "react";
import { Wand2, Download, RefreshCw, ImageIcon, Coins, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const stylePresets = [
  { id: "realistic", label: "Realistic", cost: 2 },
  { id: "anime", label: "Anime", cost: 2 },
  { id: "3d", label: "3D Render", cost: 3 },
  { id: "digital-art", label: "Digital Art", cost: 2 },
  { id: "oil-painting", label: "Oil Painting", cost: 3 },
  { id: "watercolor", label: "Watercolor", cost: 2 },
];

const aspectRatios = [
  { id: "1:1", label: "1:1", width: "w-8", height: "h-8" },
  { id: "16:9", label: "16:9", width: "w-10", height: "h-6" },
  { id: "9:16", label: "9:16", width: "w-6", height: "h-10" },
  { id: "4:3", label: "4:3", width: "w-9", height: "h-7" },
];

interface GenerationHistory {
  id: string;
  prompt: string;
  style: string;
  ratio: string;
  images: string[];
  timestamp: Date;
}

const mockHistory: GenerationHistory[] = [
  {
    id: "1",
    prompt: "A mystical forest with glowing mushrooms",
    style: "digital-art",
    ratio: "1:1",
    images: ["https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=256&h=256&fit=crop"],
    timestamp: new Date(Date.now() - 3600000),
  },
  {
    id: "2",
    prompt: "Cyberpunk city at night with neon lights",
    style: "3d",
    ratio: "16:9",
    images: ["https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=256&h=144&fit=crop"],
    timestamp: new Date(Date.now() - 7200000),
  },
  {
    id: "3",
    prompt: "Portrait of a samurai warrior",
    style: "anime",
    ratio: "1:1",
    images: ["https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=256&h=256&fit=crop"],
    timestamp: new Date(Date.now() - 86400000),
  },
];

export function ImageGenerator() {
  const [prompt, setPrompt] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("realistic");
  const [selectedRatio, setSelectedRatio] = useState("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [credits, setCredits] = useState(50);
  const [history, setHistory] = useState<GenerationHistory[]>(mockHistory);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const currentStyleCost = stylePresets.find(s => s.id === selectedStyle)?.cost || 2;

  const handleGenerate = async () => {
    if (!prompt.trim() || credits < currentStyleCost) return;
    
    setIsGenerating(true);
    setCredits(prev => prev - currentStyleCost);
    
    // Simulate generation
    setTimeout(() => {
      const newImages = [
        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=512&h=512&fit=crop",
        "https://images.unsplash.com/photo-1633259584604-afdc243122ea?w=512&h=512&fit=crop",
        "https://images.unsplash.com/photo-1563089145-599997674d42?w=512&h=512&fit=crop",
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=512&h=512&fit=crop",
      ];
      setGeneratedImages(newImages);
      
      // Add to history
      setHistory(prev => [{
        id: Date.now().toString(),
        prompt,
        style: selectedStyle,
        ratio: selectedRatio,
        images: newImages,
        timestamp: new Date(),
      }, ...prev]);
      
      setIsGenerating(false);
    }, 2000);
  };

  const removeFromHistory = (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2 tracking-tight">AI Image Generation</h1>
          <p className="text-muted-foreground">Create stunning images from text descriptions using AI</p>
        </div>
        
        {/* Credits Display */}
        <div className="flex items-center gap-3 px-5 py-3 rounded-xl border border-blue-500/30 bg-card/50">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Available Credits</p>
            <p className="text-xl font-semibold text-foreground">{credits}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Controls */}
        <div className="lg:col-span-1 space-y-6">
          {/* Prompt Input */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 block">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to create..."
              className="w-full h-32 bg-background/50 border border-blue-500/30 rounded-xl p-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500/60 smooth"
            />
          </div>

          {/* Style Presets */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 block">Style</label>
            <div className="grid grid-cols-2 gap-2">
              {stylePresets.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedStyle(style.id)}
                  className={cn(
                    "px-3 py-2.5 rounded-xl text-sm font-medium smooth border relative",
                    selectedStyle === style.id
                      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white border-transparent shadow-lg shadow-blue-500/25"
                      : "bg-background/50 text-muted-foreground hover:text-foreground border-blue-500/20 hover:border-blue-500/40"
                  )}
                >
                  {style.label}
                  <span className={cn(
                    "ml-1 text-xs",
                    selectedStyle === style.id ? "text-white/70" : "text-muted-foreground"
                  )}>
                    ({style.cost})
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 block">Aspect Ratio</label>
            <div className="flex gap-3">
              {aspectRatios.map((ratio) => (
                <button
                  key={ratio.id}
                  type="button"
                  onClick={() => setSelectedRatio(ratio.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl smooth border flex-1",
                    selectedRatio === ratio.id
                      ? "bg-blue-500/10 border-blue-500/50 text-foreground"
                      : "bg-background/50 border-blue-500/20 text-muted-foreground hover:border-blue-500/40"
                  )}
                >
                  <div className={cn("border-2 rounded", ratio.width, ratio.height, selectedRatio === ratio.id ? "border-blue-400" : "border-muted-foreground/50")} />
                  <span className="text-xs font-medium">{ratio.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating || credits < currentStyleCost}
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium smooth shadow-lg shadow-blue-500/25 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5 mr-2" />
                Generate ({currentStyleCost} credits)
              </>
            )}
          </Button>
          
          {credits < currentStyleCost && !isGenerating && (
            <p className="text-sm text-red-400 text-center">Not enough credits. Please purchase more.</p>
          )}
        </div>

        {/* Right Panel - Generated Images */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 min-h-[400px]">
            <h3 className="text-lg font-medium text-foreground mb-4">Generated Images</h3>
            {generatedImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {generatedImages.map((img, index) => (
                  <div 
                    key={index} 
                    className="relative group rounded-xl overflow-hidden border border-blue-500/20 cursor-pointer"
                    onClick={() => setLightboxImage(img)}
                  >
                    <img src={img} alt={`Generated ${index + 1}`} className="w-full aspect-square object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 smooth flex items-center justify-center gap-3">
                      <Button 
                        size="sm" 
                        className="bg-white text-black hover:bg-white/90 rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <ImageIcon className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No images generated yet</h3>
                <p className="text-muted-foreground max-w-sm">Enter a prompt and click generate to create AI-powered images</p>
              </div>
            )}
          </div>

          {/* History */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <h3 className="text-lg font-medium text-foreground mb-4">Previous Generations</h3>
            {history.length > 0 ? (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth group">
                    <img 
                      src={item.images[0]} 
                      alt={item.prompt} 
                      className="w-16 h-16 rounded-lg object-cover shrink-0 cursor-pointer hover:opacity-80 smooth"
                      onClick={() => setLightboxImage(item.images[0])}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{item.prompt}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {stylePresets.find(s => s.id === item.style)?.label} | {item.ratio} | {item.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromHistory(item.id)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No previous generations</p>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-6 right-6 p-2 text-white/70 hover:text-white smooth"
          >
            <X className="w-8 h-8" />
          </button>
          <div 
            className="relative max-w-4xl max-h-[85vh] mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={lightboxImage} 
              alt="Generated image" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-blue-500/30"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <Button className="bg-white text-black hover:bg-white/90 rounded-xl shadow-lg">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
