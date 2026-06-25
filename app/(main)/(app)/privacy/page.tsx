import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | Motion Flow",
  description: "How Motion Flow collects and uses your data",
};

const sections = [
  {
    title: "1. Information We Collect",
    content: `When you create an account, purchase a subscription, or use our services, we may collect the following information:

• **Personal Information:** name, email address, billing address, and payment details — processed securely via Paddle, our authorized merchant of record. Motion Flow never stores your full card number.
• **Usage Data:** pages visited, features used, downloads, search queries, and interaction patterns — measured via Google Analytics to help us understand what's working and what to improve.
• **Device Information:** browser type, operating system, IP address, and device identifiers.
• **Cookies & Tracking:** we use cookies and similar technologies to personalize your experience and analyze traffic. You can manage or withdraw cookie consent at any time through your browser settings.`,
  },
  {
    title: "2. How We Use Your Information",
    content: `We use the collected information to:

• Provide, maintain, and improve our services.
• Process transactions and send related information (confirmations, invoices).
• Send promotional communications (you can opt out at any time via unsubscribe link).
• Monitor and analyze usage trends to enhance user experience.
• Detect, prevent, and address technical issues and fraud.`,
  },
  {
    title: "3. Sharing of Information",
    content: `We do not sell your personal information. We may share data with:

• **Paddle** — our merchant of record, who handles payment processing on our behalf. Paddle operates under its own privacy policy and is PCI-DSS compliant.
• **Google Analytics** — for aggregated, anonymized usage analytics. Google Analytics data is not used to identify you personally.
• **Infrastructure Providers** — hosting and content delivery services that help us run the platform reliably.
• **Legal Requirements:** when required by law, regulation, court order, or to protect our legal rights.
• **Business Transfers:** in connection with a merger, acquisition, or sale of assets, subject to the same privacy protections.`,
  },
  {
    title: "4. Data Security",
    content:
      "We implement industry-standard security measures including TLS encryption in transit, encrypted storage at rest, and strict access controls to protect your personal data. Payments are handled entirely by Paddle — we never see or store raw payment credentials. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.",
  },
  {
    title: "5. Your Rights",
    content: `Depending on your jurisdiction, you may have the right to:

• Access, correct, or delete your personal data.
• Object to or restrict certain processing activities.
• Export your data in a portable format.
• Withdraw consent at any time.

To exercise any of these rights, contact us at support@motionflow.pro. We respond within 30 days.`,
  },
  {
    title: "6. GDPR — Rights of EU/EEA Users",
    content: `If you are located in the European Union or European Economic Area, you have additional rights under the General Data Protection Regulation (GDPR):

• **Legal Basis for Processing:** we process your data on the grounds of contractual necessity (to deliver the service you purchased), legitimate interest (security, fraud prevention, analytics), and your consent (marketing emails).
• **Right to Erasure:** you may request deletion of all personal data we hold about you at any time.
• **Right to Restrict Processing:** you may ask us to limit how we use your data while a complaint is resolved.
• **Right to Data Portability:** you may request a machine-readable export of your data.
• **Right to Lodge a Complaint:** you have the right to file a complaint with your local Data Protection Authority (DPA).

To exercise any GDPR right, email us at support@motionflow.pro with the subject line "GDPR Request." We will respond within 30 days.`,
  },
  {
    title: "7. CCPA — Rights of California Residents",
    content: `If you are a California resident, the California Consumer Privacy Act (CCPA) grants you the following rights:

• **Right to Know:** you may request disclosure of the categories and specific pieces of personal information we have collected about you in the past 12 months.
• **Right to Delete:** you may request deletion of your personal information, subject to certain exceptions.
• **Right to Opt-Out of Sale:** Motion Flow does not sell personal information. We do not share data with third parties for their direct marketing purposes.
• **Right to Non-Discrimination:** we will not discriminate against you for exercising any of your CCPA rights.

To submit a CCPA request, email support@motionflow.pro with the subject line "CCPA Request" or use our Contact page.`,
  },
  {
    title: "8. Data Retention",
    content:
      "We retain your personal information for as long as your account is active or as needed to provide our services. Upon account deletion, we remove your personal data within 90 days, except where retention is required by law (e.g., financial records) or to resolve open disputes.",
  },
  {
    title: "9. Third-Party Links",
    content:
      "Our platform may contain links to third-party websites or services. We are not responsible for the privacy practices of these external sites. We encourage you to review their privacy policies before sharing any personal information.",
  },
  {
    title: "10. Changes to This Policy",
    content:
      "We may update this Privacy Policy from time to time. We will notify you of significant changes by email and by posting the updated policy on this page with a new effective date. Your continued use of our services after such changes constitutes acceptance of the updated policy.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-12"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

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
            Your trust matters more than any subscription. This page explains
            exactly what data we collect, why we collect it, and how you can
            control it — in plain language, not legalese. We use a small number
            of well-known tools (Google Analytics, Paddle) and we never sell
            your data. If you have any questions, just email us at{" "}
            <a
              href="mailto:support@motionflow.pro"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              support@motionflow.pro
            </a>
            .
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

          <div className="mt-12 rounded-2xl border border-blue-500/20 bg-card/80 backdrop-blur-sm p-6">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Have questions?{" "}
              <Link
                href="/contact"
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Contact our support team
              </Link>
              . You may also want to review our{" "}
              <Link
                href="/terms"
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Terms of Use
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
