"use client";

import { ProfileHeader } from "@/components/profile-header";
import { PROFILE_PAGE_CLASS } from "@/lib/profile-layout";
import { cn } from "@/lib/utils";

export function ProfileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>
      <ProfileHeader />
      <main className={cn(PROFILE_PAGE_CLASS, "relative pt-22 pb-10")}>{children}</main>
    </div>
  );
}
