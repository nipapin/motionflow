"use client";

import { usePathname } from "next/navigation";
import { ProfileHeader } from "@/components/profile-header";
import { profilePageClassForPath } from "@/lib/profile-layout";
import { cn } from "@/lib/utils";

export function ProfileShell({
  children,
  showPartners,
  showUsers,
  showAffiliate,
}: {
  children: React.ReactNode;
  showPartners?: boolean;
  showUsers?: boolean;
  showAffiliate?: boolean;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background">
      <ProfileHeader
        showPartners={showPartners}
        showUsers={showUsers}
        showAffiliate={showAffiliate}
      />
      <main className={cn(profilePageClassForPath(pathname), "relative pt-22 pb-10")}>
        {children}
      </main>
    </div>
  );
}
