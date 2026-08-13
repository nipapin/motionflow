import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailClient } from "@/components/verify-email-client";

export const metadata: Metadata = {
  title: "Confirm email — Motion Flow",
  description: "Confirm the email address for your Motion Flow account.",
};

export default function VerifyEmailPage() {
  return (
    <div className="relative max-w-3xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 tracking-tight">
          Confirm email
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl text-pretty leading-relaxed">
          We’re verifying the address you registered with so you can sign in
          and receive account emails.
        </p>
      </div>

      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Confirming…</p>
        }
      >
        <VerifyEmailClient />
      </Suspense>
    </div>
  );
}
