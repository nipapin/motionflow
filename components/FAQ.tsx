"use client";

import { useState } from "react";
import { faq } from "@/lib/data";

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-20">
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            FAQ
          </h2>
        </div>

        <div className="mt-10 relative overflow-hidden rounded-2xl card">
          <div
            className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
            aria-hidden="true"
          />
          <div className="relative z-[1] divide-y divide-line px-4 sm:px-6 pointer-events-auto">
          {faq.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 py-5 text-left group"
                  aria-expanded={isOpen}
                >
                  <span className="font-medium text-base text-foreground">
                    {item.q}
                  </span>
                  <span
                    className={`w-6 h-6 shrink-0 grid place-items-center text-muted group-hover:text-foreground transition-all ${
                      isOpen ? "rotate-45 text-foreground" : ""
                    }`}
                  >
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </button>
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen
                      ? "grid-rows-[1fr] opacity-100 pb-5"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="text-muted leading-relaxed">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </section>
  );
}
