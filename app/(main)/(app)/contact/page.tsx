import type { Metadata } from "next";
import { ContactPageClient } from "@/components/contact-page-client";

export const metadata: Metadata = {
    title: "Contact us — Motion Flow",
    description:
        "Have a question, business offer or feedback? Send us a message and we'll get back to you within 24 hours.",
};

export default function ContactPage() {
    return (
        <div className="relative max-w-3xl mx-auto px-6 py-12">
            <div className="mb-12">
                <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-4 tracking-tight">
                    Contact Us
                </h1>
                <p className="text-muted-foreground text-lg max-w-2xl text-pretty leading-relaxed">
                    Have a question or need help? We&apos;d love to hear from you.
                </p>
            </div>

            <ContactPageClient />

            <p className="mt-6 text-center text-sm text-muted-foreground">
                Or email us directly at{" "}
                <a
                    href="mailto:support@motionflow.pro"
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                    support@motionflow.pro
                </a>
            </p>
        </div>
    );
}
