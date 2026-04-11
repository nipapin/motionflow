"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { TextToSpeech } from "@/components/text-to-speech";
import { cn } from "@/lib/utils";

export function TextToSpeechPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        activeCategory="Text to Speech"
        onCategoryChange={() => {}}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        useLinks={true}
      />
      <div className={cn(
        "transition-all duration-300",
        sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-72"
      )}>
        <Header 
          searchQuery={searchQuery} 
          onSearchChange={setSearchQuery}
          sidebarCollapsed={sidebarCollapsed}
        />
        <main className="p-6 pt-22">
          <TextToSpeech />
        </main>
      </div>
    </div>
  );
}
