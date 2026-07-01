"use client";

import { useEffect, useState } from "react";

const links = [
  { href: "#download", label: "Download" },
  { href: "#projects", label: "Projects" },
  { href: "#features", label: "Features" },
  { href: "#how-to-use", label: "How To Use" },
  { href: "#pricing", label: "Pricing" },
  { href: "#contact", label: "Contact" },
];

export function Navbar() {
  return <NavbarWithOffset />;
}

export function NavbarWithOffset({
  topClassName = "top-3",
  position = "fixed",
  className = "",
}: {
  topClassName?: string;
  position?: "fixed" | "sticky";
  className?: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`${position} ${topClassName} left-0 right-0 z-50 ${className}`}>
      <div className="max-w-7xl mx-auto px-5 sm:px-8 mb-2">
        <div
          className={`card relative overflow-hidden rounded-2xl border border-brand-500/25 ${
            scrolled
              ? "shadow-[0_1px_0_0_rgb(255_255_255/0.08)_inset,0_10px_30px_-18px_rgb(0_0_0/0.55)]"
              : "shadow-none"
          }`}
        >
          <div
            className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
            aria-hidden="true"
          />
          <nav className="relative z-[1] h-14 px-3 sm:px-4 flex items-center gap-3">
            <a href="#top" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand-violet grid place-items-center shadow-[inset_0_1px_0_0_rgb(255_255_255/0.25)]">
                <span className="text-white font-semibold text-sm">S</span>
              </div>
              <span className="font-semibold tracking-tight text-foreground">
                Spunkram
              </span>
            </a>

            <div className="ml-auto hidden md:flex items-center gap-6">
              <ul className="flex items-center gap-7 text-sm text-muted">
                {links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      className="hover:text-foreground transition-colors"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ml-auto md:hidden flex items-center gap-2">
              <button
                aria-label="Menu"
                onClick={() => setOpen(!open)}
                className="w-9 h-9 grid place-items-center rounded-lg border border-line/60 bg-page/20 backdrop-blur-xl"
              >
                <span className="sr-only">Menu</span>
                <div className="w-5 flex flex-col gap-[5px]">
                  <span
                    className={`h-[1.5px] bg-foreground transition-transform ${
                      open ? "translate-y-[7px] rotate-45" : ""
                    }`}
                  />
                  <span
                    className={`h-[1.5px] bg-foreground transition-opacity ${
                      open ? "opacity-0" : ""
                    }`}
                  />
                  <span
                    className={`h-[1.5px] bg-foreground transition-transform ${
                      open ? "-translate-y-[7px] -rotate-45" : ""
                    }`}
                  />
                </div>
              </button>
            </div>
          </nav>
        </div>
      </div>

      {open && (
        <div className="md:hidden max-w-7xl mx-auto px-5 sm:px-8 pt-2">
          <div className="card relative overflow-hidden rounded-2xl border border-brand-500/25">
            <div
              className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
              aria-hidden="true"
            />
            <ul className="relative z-[1] px-3 sm:px-4 py-3 flex flex-col gap-1.5">
              {links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block py-2 text-muted hover:text-foreground transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}
