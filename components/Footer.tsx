export function Footer() {
  return (
    <footer>
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10">
        <div className="relative overflow-hidden rounded-2xl card px-5 sm:px-8 py-8 sm:py-10">
          <div
            className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
            aria-hidden="true"
          />
          <div className="relative z-[1]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-violet grid place-items-center shadow-[inset_0_1px_0_0_rgb(255_255_255/0.25)]">
                  <span className="text-white font-semibold text-sm">S</span>
                </div>
                <span className="font-semibold tracking-tight text-foreground">
                  Spunkram
                </span>
              </div>

              <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
                <a href="#projects" className="hover:text-foreground">
                  Projects
                </a>
                <a href="#pricing" className="hover:text-foreground">
                  Pricing
                </a>
                <a href="#download" className="hover:text-foreground">
                  Download
                </a>
                <a href="#faq" className="hover:text-foreground">
                  FAQ
                </a>
                <a href="#contact" className="hover:text-foreground">
                  Contact
                </a>
              </nav>
            </div>

            <div className="mt-8 flex flex-col gap-2 pt-6 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
              <p>© {new Date().getFullYear()} Spunkram.</p>
              <p>
                Adobe, Premiere Pro and After Effects are trademarks of Adobe
                Inc.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
