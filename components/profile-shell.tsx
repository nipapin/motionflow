"use client";

import { usePathname } from "next/navigation";
import { ProfileHeader } from "@/components/profile-header";
import { profilePageClassForPath } from "@/lib/profile-layout";
import { cn } from "@/lib/utils";

export function ProfileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background">
      <ProfileHeader />
      <main className={cn(profilePageClassForPath(pathname), "relative pt-22 pb-10")}>
        {children}
      </main>
    </div>
  );
}
