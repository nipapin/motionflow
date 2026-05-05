"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const subjects = [
  "General Inquiry",
  "Billing & Subscription",
  "Refund Request",
  "Technical Issue",
  "License Question",
  "Feature Request",
  "Partnership",
  "Other",
];

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

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

        {submitted ? (
          <div className="rounded-3xl border border-emerald-500/20 bg-card/80 backdrop-blur-sm p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Send className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Message Sent
            </h2>
            <p className="text-muted-foreground leading-relaxed max-w-md mx-auto">
              Thank you for reaching out! We&apos;ll get back to you within 24
              hours.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-blue-500/20 bg-card/80 backdrop-blur-sm p-8"
          >
            <div className="grid sm:grid-cols-2 gap-6 mb-6">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground mb-2"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="mb-6">
              <label
                htmlFor="subject"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Subject
              </label>
              <select
                id="subject"
                required
                value={formData.subject}
                onChange={(e) =>
                  setFormData({ ...formData, subject: e.target.value })
                }
                className={cn(
                  "w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all appearance-none",
                  !formData.subject && "text-muted-foreground/50"
                )}
              >
                <option value="" disabled>
                  Select a subject
                </option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-8">
              <label
                htmlFor="message"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Message
              </label>
              <textarea
                id="message"
                required
                rows={5}
                value={formData.message}
                onChange={(e) =>
                  setFormData({ ...formData, message: e.target.value })
                }
                className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all resize-none"
                placeholder="Tell us how we can help..."
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/25 transition-all duration-300"
            >
              Send Message
            </Button>
          </form>
        )}

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
