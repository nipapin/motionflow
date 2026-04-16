"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const sections = [
  {
    title: "1. Acceptance of Terms",
    content:
      "By accessing or using Motion Flow, you agree to be bound by these Terms of Use. If you do not agree to all terms, you may not use our services. We reserve the right to update these terms at any time, and your continued use constitutes acceptance of any modifications.",
  },
  {
    title: "2. Account Registration",
    content:
      "To access certain features, you must create an account. You are responsible for maintaining the confidentiality of your credentials and for all activities that occur under your account. You must provide accurate information and promptly update it if it changes. We reserve the right to suspend or terminate accounts that violate these terms.",
  },
  {
    title: "3. Subscription & Payments",
    content:
      "Paid subscriptions are billed on a recurring basis (monthly or yearly) according to the plan you select. All fees are charged in advance and are non-refundable except as described in our Refund Policy. You authorize us to charge your payment method automatically for each billing cycle. You may cancel your subscription at any time; access continues until the end of your current billing period.",
  },
  {
    title: "4. Permitted Use",
    content: `You may use content downloaded from Motion Flow in personal and commercial projects in accordance with our License Agreement. You may NOT:

• Redistribute, resell, or sublicense downloaded assets as standalone files.
• Claim ownership of assets created by Motion Flow or its contributors.
• Use our platform for any illegal, fraudulent, or harmful purpose.
• Attempt to reverse-engineer, scrape, or automate access to our platform.
• Share your account credentials with others or allow multiple users on a single account.`,
  },
  {
    title: "5. Intellectual Property",
    content:
      "All content on Motion Flow — including templates, audio, graphics, AI-generated outputs, software, and branding — is owned by Motion Flow or its licensors. Your subscription grants you a license to use downloaded content as specified in our License Agreement, but does not transfer ownership of any intellectual property.",
  },
  {
    title: "6. AI-Generated Content",
    content:
      "Our AI tools (image generation, video generation, text-to-speech, speech-to-text) produce outputs based on your inputs. You receive a license to use AI-generated outputs in your projects under the same terms as other platform content. We do not guarantee that AI outputs are unique or free from similarities to other works.",
  },
  {
    title: "7. Limitation of Liability",
    content:
      "Motion Flow is provided \"as is\" without warranties of any kind. To the fullest extent permitted by law, we shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of our services, including but not limited to loss of profits, data, or business opportunities.",
  },
  {
    title: "8. Termination",
    content:
      "We may suspend or terminate your access to our services at any time, with or without cause, including for violation of these terms. Upon termination, your right to use the platform ceases immediately, but licenses granted for previously downloaded content remain valid per our License Agreement.",
  },
  {
    title: "9. Governing Law",
    content:
      "These Terms of Use are governed by and construed in accordance with applicable laws. Any disputes arising from these terms shall be resolved through binding arbitration or in courts of competent jurisdiction.",
  },
  {
    title: "10. Contact",
    content:
      "If you have any questions about these Terms of Use, please contact us at support@motionflow.studio.",
  },
];

export default function TermsPage() {
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
            Terms of Use
          </h1>
          <p className="text-muted-foreground text-sm">
            Effective date: April 16, 2025
          </p>
        </div>

        <div className="space-y-10">
          <p className="text-muted-foreground leading-relaxed">
            Welcome to Motion Flow. These Terms of Use govern your access to and
            use of our website, applications, and services. Please read them
            carefully before using our platform.
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
        </div>
      </div>
    </div>
  );
}
