"use client";

import { useSearchParams } from "next/navigation";

export function ResetPasswordIntro() {
  const searchParams = useSearchParams();
  const invite = searchParams.get("source") === "invite";

  return (
    <div className="mb-10">
      <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 tracking-tight">
        {invite ? "Set your password" : "Reset password"}
      </h1>
      <p className="text-muted-foreground text-lg max-w-2xl text-pretty leading-relaxed">
        {invite
          ? "Choose a password for your Motion Flow account. The invite link from your email expires after 7 days."
          : "Choose a new password for your account. The link from your email expires after one hour."}
      </p>
    </div>
  );
}
