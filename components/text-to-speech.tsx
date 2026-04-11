"use client";

import { useState, useRef } from "react";
import { Volume2, Download, Play, Pause, RefreshCw, Coins, Trash2, X, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const voicePresets = [
  { id: "female-1", label: "Sarah", gender: "Female", accent: "American", cost: 1 },
  { id: "male-1", label: "James", gender: "Male", accent: "British", cost: 1 },
  { id: "female-2", label: "Emma", gender: "Female", accent: "British", cost: 1 },
  { id: "male-2", label: "Michael", gender: "Male", accent: "American", cost: 1 },
  { id: "female-3", label: "Sofia", gender: "Female", accent: "Spanish", cost: 2 },
  { id: "male-3", label: "David", gender: "Male", accent: "Australian", cost: 2 },
];

const speedOptions = [
  { id: "0.5", label: "0.5x" },
  { id: "0.75", label: "0.75x" },
  { id: "1", label: "1x" },
  { id: "1.25", label: "1.25x" },
  { id: "1.5", label: "1.5x" },
  { id: "2", label: "2x" },
];

interface SpeechHistory {
  id: string;
  text: string;
  voice: string;
  speed: string;
  duration: string;
  audioUrl: string;
  timestamp: Date;
}

const mockHistory: SpeechHistory[] = [
  {
    id: "1",
    text: "Welcome to Motion Flow, your premium source for video templates.",
    voice: "female-1",
    speed: "1",
    duration: "0:05",
    audioUrl: "#",
    timestamp: new Date(Date.now() - 3600000),
  },
  {
    id: "2",
    text: "Create stunning videos with our AI-powered tools.",
    voice: "male-1",
    speed: "1",
    duration: "0:04",
    audioUrl: "#",
    timestamp: new Date(Date.now() - 7200000),
  },
];

export function TextToSpeech() {
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("female-1");
  const [selectedSpeed, setSelectedSpeed] = useState("1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [credits, setCredits] = useState(100);
  const [history, setHistory] = useState<SpeechHistory[]>(mockHistory);
  const [playingHistoryId, setPlayingHistoryId] = useState<string | null>(null);

  const currentVoiceCost = voicePresets.find(v => v.id === selectedVoice)?.cost || 1;
  const characterCount = text.length;
  const estimatedCost = Math.ceil(characterCount / 100) * currentVoiceCost;

  const handleGenerate = async () => {
    if (!text.trim() || credits < estimatedCost) return;
    
    setIsGenerating(true);
    setCredits(prev => prev - estimatedCost);
    
    setTimeout(() => {
      setGeneratedAudio("generated-audio-url");
      
      setHistory(prev => [{
        id: Date.now().toString(),
        text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
        voice: selectedVoice,
        speed: selectedSpeed,
        duration: `0:${Math.max(3, Math.ceil(text.length / 20)).toString().padStart(2, '0')}`,
        audioUrl: "#",
        timestamp: new Date(),
      }, ...prev]);
      
      setIsGenerating(false);
    }, 2000);
  };

  const removeFromHistory = (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  const togglePlayHistory = (id: string) => {
    if (playingHistoryId === id) {
      setPlayingHistoryId(null);
    } else {
      setPlayingHistoryId(id);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2 tracking-tight">Text to Speech</h1>
          <p className="text-muted-foreground">Convert text into natural-sounding speech with AI voices</p>
        </div>
        
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
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-foreground">Text</label>
              <span className="text-xs text-muted-foreground">{characterCount} characters</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the text you want to convert to speech..."
              className="w-full h-40 bg-background/50 border border-blue-500/30 rounded-xl p-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500/60 smooth"
            />
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 block">Voice</label>
            <div className="grid grid-cols-2 gap-2">
              {voicePresets.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => setSelectedVoice(voice.id)}
                  className={cn(
                    "px-3 py-3 rounded-xl text-sm smooth border text-left",
                    selectedVoice === voice.id
                      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white border-transparent shadow-lg shadow-blue-500/25"
                      : "bg-background/50 text-muted-foreground hover:text-foreground border-blue-500/20 hover:border-blue-500/40"
                  )}
                >
                  <div className="font-medium">{voice.label}</div>
                  <div className={cn(
                    "text-xs mt-0.5",
                    selectedVoice === voice.id ? "text-white/70" : "text-muted-foreground"
                  )}>
                    {voice.gender} | {voice.accent}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 block">Speed</label>
            <div className="flex gap-2">
              {speedOptions.map((speed) => (
                <button
                  key={speed.id}
                  type="button"
                  onClick={() => setSelectedSpeed(speed.id)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-medium smooth border",
                    selectedSpeed === speed.id
                      ? "bg-blue-500/10 border-blue-500/50 text-foreground"
                      : "bg-background/50 border-blue-500/20 text-muted-foreground hover:border-blue-500/40"
                  )}
                >
                  {speed.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!text.trim() || isGenerating || credits < estimatedCost}
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium smooth shadow-lg shadow-blue-500/25 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Volume2 className="w-5 h-5 mr-2" />
                Generate Speech ({estimatedCost || 1} credits)
              </>
            )}
          </Button>
          
          {credits < estimatedCost && !isGenerating && text.trim() && (
            <p className="text-sm text-red-400 text-center">Not enough credits. Please purchase more.</p>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 min-h-[300px]">
            <h3 className="text-lg font-medium text-foreground mb-4">Generated Audio</h3>
            {generatedAudio ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-blue-500/20 bg-background/30 p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <button
                      type="button"
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="w-14 h-14 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-center text-white hover:scale-105 smooth shadow-lg shadow-blue-500/25"
                    >
                      {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                    </button>
                    <div className="flex-1">
                      <div className="h-2 bg-blue-500/20 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full w-1/3" />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>0:02</span>
                        <span>0:06</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-blue-500/20">
                    <div className="text-sm text-muted-foreground">
                      <span className="text-foreground font-medium">{voicePresets.find(v => v.id === selectedVoice)?.label}</span>
                      <span className="mx-2">|</span>
                      <span>{selectedSpeed}x speed</span>
                    </div>
                    <Button size="sm" className="bg-white text-black hover:bg-white/90 rounded-lg">
                      <Download className="w-4 h-4 mr-1" />
                      Download MP3
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <Volume2 className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No audio generated yet</h3>
                <p className="text-muted-foreground max-w-sm">Enter text and click generate to create AI speech</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <h3 className="text-lg font-medium text-foreground mb-4">Previous Generations</h3>
            {history.length > 0 ? (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth group">
                    <button
                      type="button"
                      onClick={() => togglePlayHistory(item.id)}
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0 smooth",
                        playingHistoryId === item.id 
                          ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white" 
                          : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                      )}
                    >
                      {playingHistoryId === item.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{item.text}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {voicePresets.find(v => v.id === item.voice)?.label} | {item.speed}x | {item.duration}
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
    </div>
  );
}
