"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { ImageGenerator } from "@/components/image-generator";

export function ImageGeneratorPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
      </div>
      
      <Sidebar 
        activeCategory="Image Gen" 
        onCategoryChange={() => {}}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        useLinks={true}
      />
      
      <div className={cn("transition-all duration-300", sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-72")}>
        <Header 
          searchQuery={searchQuery} 
          onSearchChange={setSearchQuery}
          sidebarCollapsed={sidebarCollapsed}
        />
        
        <main className="p-6 pt-22">
          <ImageGenerator />
        </main>
      </div>
    </div>
  );
}
