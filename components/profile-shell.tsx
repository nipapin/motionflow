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
  admin = false,
}: {
  children: React.ReactNode;
  showPartners?: boolean;
  showUsers?: boolean;
  showAffiliate?: boolean;
  admin?: boolean;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background">
      <ProfileHeader
        showPartners={showPartners}
        showUsers={showUsers}
        showAffiliate={showAffiliate}
        admin={admin}
      />
      <main className={cn(profilePageClassForPath(pathname, admin), "relative pt-22 pb-10")}>
        {children}
      </main>
    </div>
  );
}
