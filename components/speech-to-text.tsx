"use client";

import { useState, useRef } from "react";
import { Mic, MicOff, Upload, Download, RefreshCw, Trash2, Copy, Check, FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGenerations } from "@/hooks/use-generations";
import { GenerationsBadge } from "@/components/generations-badge";

const languageOptions = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "ru", label: "Russian" },
  { id: "ja", label: "Japanese" },
];

const outputFormats = [
  { id: "text", label: "Plain Text", extension: ".txt" },
  { id: "srt", label: "SRT Subtitles", extension: ".srt" },
  { id: "vtt", label: "VTT Subtitles", extension: ".vtt" },
];

interface TranscriptionHistory {
  id: string;
  filename: string;
  language: string;
  duration: string;
  text: string;
  timestamp: Date;
}

const mockHistory: TranscriptionHistory[] = [
  {
    id: "1",
    filename: "interview_clip.mp3",
    language: "en",
    duration: "2:45",
    text: "Today we're discussing the future of AI in creative industries...",
    timestamp: new Date(Date.now() - 3600000),
  },
  {
    id: "2",
    filename: "podcast_intro.wav",
    language: "en",
    duration: "0:32",
    text: "Welcome to the show! I'm your host and today we have an exciting episode...",
    timestamp: new Date(Date.now() - 7200000),
  },
];

export function SpeechToText() {
  const {
    status: generations,
    loading: generationsLoading,
    authenticated,
    consume,
  } = useGenerations();

  const [isRecording, setIsRecording] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [selectedFormat, setSelectedFormat] = useState("text");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribedText, setTranscribedText] = useState("");
  const [history, setHistory] = useState<TranscriptionHistory[]>(mockHistory);
  const [copied, setCopied] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const remaining = generations?.remaining ?? 0;
  const noGenerationsLeft =
    authenticated && !generationsLoading && remaining <= 0;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const startRecording = () => {
    setIsRecording(true);
    setRecordingTime(0);
    recordingIntervalRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTranscribe = async () => {
    setErrorMessage(null);
    if (!uploadedFile && !isRecording && recordingTime === 0) return;
    if (!authenticated || noGenerationsLeft) return;

    setIsTranscribing(true);

    try {
      await consume("stt");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start transcription",
      );
      setIsTranscribing(false);
      return;
    }

    setTimeout(() => {
      const result = uploadedFile 
        ? "This is the transcribed text from your uploaded audio file. The AI has processed the speech and converted it into text format. You can now edit, copy, or download this transcription."
        : "This is the transcribed text from your voice recording. The AI has captured your spoken words and converted them into text format accurately.";
      
      setTranscribedText(result);
      
      setHistory(prev => [{
        id: Date.now().toString(),
        filename: uploadedFile?.name || `Recording ${formatTime(recordingTime)}`,
        language: selectedLanguage,
        duration: uploadedFile ? "1:30" : formatTime(recordingTime),
        text: result.substring(0, 80) + "...",
        timestamp: new Date(),
      }, ...prev]);
      
      setIsTranscribing(false);
      setUploadedFile(null);
      setRecordingTime(0);
    }, 2500);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcribedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const removeFromHistory = (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-foreground mb-2 tracking-tight">Speech to Text</h1>
          <p className="text-muted-foreground">Convert audio recordings and files into accurate text transcriptions</p>
        </div>
        
        <GenerationsBadge
          status={generations}
          loading={generationsLoading}
          authenticated={authenticated}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {/* Recording Section */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-4 block">Record Audio</label>
            <div className="flex flex-col items-center py-6">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  "w-24 h-24 rounded-full flex items-center justify-center smooth shadow-lg",
                  isRecording 
                    ? "bg-gradient-to-r from-red-600 to-red-500 text-white animate-pulse shadow-red-500/25" 
                    : "bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:scale-105 shadow-blue-500/25"
                )}
              >
                {isRecording ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
              </button>
              <div className="mt-4 text-center">
                {isRecording ? (
                  <>
                    <p className="text-lg font-semibold text-red-400">{formatTime(recordingTime)}</p>
                    <p className="text-sm text-muted-foreground">Recording... Click to stop</p>
                  </>
                ) : recordingTime > 0 ? (
                  <>
                    <p className="text-lg font-semibold text-foreground">{formatTime(recordingTime)}</p>
                    <p className="text-sm text-muted-foreground">Recording ready</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to start recording</p>
                )}
              </div>
            </div>
          </div>

          {/* Upload Section */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 block">Or Upload File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-8 border-2 border-dashed border-blue-500/30 rounded-xl hover:border-blue-500/60 smooth flex flex-col items-center justify-center gap-3 bg-background/30"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              {uploadedFile ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">{uploadedFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Drop audio/video file here</p>
                  <p className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A, MP4, MOV</p>
                </div>
              )}
            </button>
          </div>

          {/* Language Selection */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 block">Language</label>
            <div className="grid grid-cols-3 gap-2">
              {languageOptions.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setSelectedLanguage(lang.id)}
                  className={cn(
                    "px-3 py-2.5 rounded-xl text-sm font-medium smooth border",
                    selectedLanguage === lang.id
                      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white border-transparent shadow-lg shadow-blue-500/25"
                      : "bg-background/50 text-muted-foreground hover:text-foreground border-blue-500/20 hover:border-blue-500/40"
                  )}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Output Format */}
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <label className="text-sm font-medium text-foreground mb-3 block">Output Format</label>
            <div className="flex gap-2">
              {outputFormats.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  onClick={() => setSelectedFormat(format.id)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-medium smooth border",
                    selectedFormat === format.id
                      ? "bg-blue-500/10 border-blue-500/50 text-foreground"
                      : "bg-background/50 border-blue-500/20 text-muted-foreground hover:border-blue-500/40"
                  )}
                >
                  {format.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleTranscribe}
            disabled={
              (!uploadedFile && recordingTime === 0) ||
              isTranscribing ||
              !authenticated ||
              noGenerationsLeft
            }
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl font-medium smooth shadow-lg shadow-blue-500/25 disabled:opacity-50"
          >
            {isTranscribing ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Transcribing...
              </>
            ) : (
              <>
                <FileAudio className="w-5 h-5 mr-2" />
                Transcribe
              </>
            )}
          </Button>

          {!authenticated && (
            <p className="text-sm text-red-400 text-center">
              Please sign in to transcribe audio.
            </p>
          )}

          {noGenerationsLeft && (
            <p className="text-sm text-red-400 text-center">
              You&apos;ve reached your generation limit. Upgrade your plan to keep
              creating.
            </p>
          )}

          {errorMessage && (
            <p className="text-sm text-red-400 text-center">{errorMessage}</p>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5 min-h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-foreground">Transcription</h3>
              {transcribedText && (
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={copyToClipboard}
                    className="border-blue-500/30 hover:border-blue-500/60 rounded-lg"
                  >
                    {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button size="sm" className="bg-white text-black hover:bg-white/90 rounded-lg">
                    <Download className="w-4 h-4 mr-1" />
                    Download {outputFormats.find(f => f.id === selectedFormat)?.extension}
                  </Button>
                </div>
              )}
            </div>
            {transcribedText ? (
              <div className="rounded-xl border border-blue-500/20 bg-background/30 p-5">
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">{transcribedText}</p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <Mic className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No transcription yet</h3>
                <p className="text-muted-foreground max-w-sm">Record audio or upload a file to get started</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
            <h3 className="text-lg font-medium text-foreground mb-4">Previous Transcriptions</h3>
            {history.length > 0 ? (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-3 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth group">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <FileAudio className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium truncate">{item.filename}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {languageOptions.find(l => l.id === item.language)?.label} | {item.duration}
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
              <p className="text-sm text-muted-foreground text-center py-8">No previous transcriptions</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
