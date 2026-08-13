import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password — Motion Flow",
  description: "Choose a new password for your Motion Flow account.",
};

export default function ResetPasswordPage() {
  return (
    <div className="relative max-w-3xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 tracking-tight">
          Reset password
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl text-pretty leading-relaxed">
          Choose a new password for your account. The link from your email
          expires after one hour.
        </p>
      </div>

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
