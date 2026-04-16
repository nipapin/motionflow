"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const sections = [
  {
    title: "1. Subscription Refunds",
    content:
      "We offer a full refund within 7 days of your initial subscription purchase if you have not downloaded more than 5 assets. To request a refund, contact us at support@motionflow.studio with your account email and order details. Refunds are processed to the original payment method within 5–10 business days.",
  },
  {
    title: "2. Renewal Charges",
    content:
      "Subscriptions renew automatically at the end of each billing cycle. If you forget to cancel before a renewal, contact us within 48 hours of the charge for a full refund of the renewal payment, provided you have not downloaded any new assets during the renewed period.",
  },
  {
    title: "3. Non-Refundable Situations",
    content: `Refunds are generally not available in the following cases:

• More than 7 days have passed since the initial purchase.
• You have downloaded more than 5 assets during the refund period.
• The subscription has been actively used for content creation or AI generation.
• A renewal charge refund is requested more than 48 hours after billing.
• Your account has been terminated due to a violation of our Terms of Use.`,
  },
  {
    title: "4. AI Credits & Add-ons",
    content:
      "Purchases of AI credits or one-time add-ons are non-refundable once any credits have been consumed. If no credits have been used, you may request a refund within 7 days of purchase.",
  },
  {
    title: "5. Plan Changes",
    content:
      "If you upgrade your plan mid-cycle, the price difference is charged immediately. If you downgrade, the new rate takes effect at the next billing cycle — no partial refunds are issued for the remaining days on a higher plan.",
  },
  {
    title: "6. Disputes",
    content:
      "If you believe a charge was made in error or you have not received the service you paid for, please contact us before filing a dispute with your bank. We are committed to resolving issues promptly and fairly.",
  },
  {
    title: "7. How to Request a Refund",
    content: `To initiate a refund, send an email to support@motionflow.studio with:

• Your account email address.
• Date of purchase.
• Reason for the refund request.

We will review your request and respond within 2 business days.`,
  },
];

export default function RefundPolicyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-3xl mx-auto px-6 py-12">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-12"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 tracking-tight">
            Refund Policy
          </h1>
          <p className="text-muted-foreground text-sm">
            Effective date: April 16, 2025
          </p>
        </div>

        <div className="space-y-10">
          <p className="text-muted-foreground leading-relaxed">
            We want you to be satisfied with your Motion Flow subscription. This
            policy outlines the conditions under which we offer refunds.
          </p>

          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-xl font-semibold text-foreground mb-4">
                {section.title}
              </h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {section.content}
              </p>
            </div>
          ))}

          <div className="mt-12 rounded-2xl border border-blue-500/20 bg-card/80 backdrop-blur-sm p-6">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Have questions about refunds?{" "}
              <Link
                href="/contact"
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Contact our support team
              </Link>{" "}
              — we&apos;re happy to help.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
