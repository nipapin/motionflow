"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
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
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (admin) {
      const content = mainRef.current?.querySelector<HTMLElement>('[data-slot="profile-content"]');
      if (content) content.scrollTop = 0;
    }
  }, [admin, pathname]);
  return (
    <div className={admin ? "fixed inset-0 flex flex-col overflow-hidden bg-background pt-16" : "min-h-screen bg-background"}>
      <ProfileHeader
        showPartners={showPartners}
        showUsers={showUsers}
        showAffiliate={showAffiliate}
        admin={admin}
      />
      <main ref={mainRef} className={cn(profilePageClassForPath(pathname, admin), admin
        ? "relative min-h-0 flex-1 overflow-hidden"
        : "relative pt-22 pb-10")}
      >
        {children}
      </main>
    </div>
  );
}
