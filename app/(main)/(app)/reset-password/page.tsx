import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { ResetPasswordIntro } from "@/components/reset-password-intro";

export const metadata: Metadata = {
  title: "Reset password — Motion Flow",
  description: "Choose a new password for your Motion Flow account.",
};

export default function ResetPasswordPage() {
  return (
    <div className="relative max-w-3xl mx-auto px-6 py-12">
      <Suspense
        fallback={
          <div className="mb-10">
            <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 tracking-tight">
              Reset password
            </h1>
          </div>
        }
      >
        <ResetPasswordIntro />
      </Suspense>

      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading reset form…</p>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
