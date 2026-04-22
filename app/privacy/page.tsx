"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const sections = [
  {
    title: "1. Information We Collect",
    content: `When you create an account, purchase a subscription, or use our services, we may collect the following information:

• **Personal Information:** name, email address, billing address, and payment details.
• **Usage Data:** pages visited, features used, downloads, search queries, and interaction patterns.
• **Device Information:** browser type, operating system, IP address, and device identifiers.
• **Cookies & Tracking:** we use cookies and similar technologies to personalize your experience and analyze traffic.`,
  },
  {
    title: "2. How We Use Your Information",
    content: `We use the collected information to:

• Provide, maintain, and improve our services.
• Process transactions and send related information (confirmations, invoices).
• Send promotional communications (you can opt out at any time).
• Monitor and analyze usage trends to enhance user experience.
• Detect, prevent, and address technical issues and fraud.`,
  },
  {
    title: "3. Sharing of Information",
    content: `We do not sell your personal information. We may share data with:

• **Service Providers:** third-party vendors who assist us in operating our platform (payment processors, hosting, analytics).
• **Legal Requirements:** when required by law, regulation, or legal process.
• **Business Transfers:** in connection with a merger, acquisition, or sale of assets.`,
  },
  {
    title: "4. Data Security",
    content:
      "We implement industry-standard security measures including encryption, secure servers, and access controls to protect your personal data. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.",
  },
  {
    title: "5. Your Rights",
    content: `Depending on your jurisdiction, you may have the right to:

• Access, correct, or delete your personal data.
• Object to or restrict certain processing activities.
• Export your data in a portable format.
• Withdraw consent at any time.

To exercise these rights, contact us at support@motionflow.pro.`,
  },
  {
    title: "6. Data Retention",
    content:
      "We retain your personal information for as long as your account is active or as needed to provide you with services. We may also retain data as necessary to comply with legal obligations, resolve disputes, and enforce agreements.",
  },
  {
    title: "7. Third-Party Links",
    content:
      "Our platform may contain links to third-party websites or services. We are not responsible for the privacy practices of these external sites. We encourage you to review their privacy policies.",
  },
  {
    title: "8. Changes to This Policy",
    content:
      "We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the new policy on this page and updating the effective date. Your continued use of our services after changes constitutes acceptance of the updated policy.",
  },
];

export default function PrivacyPolicyPage() {
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
            Privacy Policy
          </h1>
          <p className="text-muted-foreground text-sm">
            Effective date: April 16, 2025
          </p>
        </div>

        <div className="space-y-10">
          <p className="text-muted-foreground leading-relaxed">
            At Motion Flow, we take your privacy seriously. This Privacy Policy
            explains how we collect, use, disclose, and safeguard your
            information when you use our platform and services.
          </p>

          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-xl font-semibold text-foreground mb-4">
                {section.title}
              </h2>
              <div className="text-muted-foreground leading-relaxed whitespace-pre-line prose-strong:text-foreground">
                {section.content.split("**").map((part, i) =>
                  i % 2 === 1 ? (
                    <strong key={i} className="text-foreground">
                      {part}
                    </strong>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
