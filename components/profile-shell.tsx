"use client";

import { ProfileHeader } from "@/components/profile-header";
import { PROFILE_PAGE_CLASS } from "@/lib/profile-layout";
import { cn } from "@/lib/utils";

export function ProfileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <ProfileHeader />
      <main className={cn(PROFILE_PAGE_CLASS, "relative pt-22 pb-10")}>{children}</main>
    </div>
  );
}
