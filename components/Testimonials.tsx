const reviews: Array<{
  photo: string;
  name: string;
  role: string;
  text: string;
}> = [
  {
    photo:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face",
    name: "Marcus Reid",
    role: "Senior Video Editor · Freelance",
    text: "The extension lives right inside Premiere. I drag a transition onto the timeline and it just works — no hunting through folders, no broken links. Easily saves me an hour every edit.",
  },
  {
    photo:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face",
    name: "Alina Kowalski",
    role: "Motion Designer · Vividframe Studio",
    text: "The After Effects projects are clean and actually easy to customize. Swap the text, change a color, render. Our whole team installed it the same week and never looked back.",
  },
  {
    photo:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face",
    name: "Tom Brecker",
    role: "Colorist & Editor · Documentary Films",
    text: "One subscription, the whole library, and new packs keep showing up. The smart resize alone makes repurposing a 16:9 cut into vertical painless. Worth every cent.",
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5" aria-label="5 out of 5 stars">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg
          key={i}
          className="h-3.5 w-3.5 text-amber-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M9.05 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.366-2.446a1 1 0 00-1.176 0l-3.366 2.446c-.784.57-1.838-.197-1.539-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.075 9.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
        </svg>
      ))}
    </div>
  );
}

export function Testimonials() {
  return (
    <section id="reviews" className="relative py-20">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="mb-8">
          <div className="text-xs font-medium text-muted uppercase tracking-[0.2em]">
            Loved by editors
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Built for people who ship video
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reviews.map((r) => (
            <div
              key={r.name}
              className="card card-hover relative overflow-hidden rounded-3xl border border-brand-500/25"
            >
              <div
                className="card-sheen-pricing pointer-events-none absolute inset-0 z-0"
                aria-hidden="true"
              />
              <div className="relative z-[1] flex h-full flex-col gap-4 p-5 sm:p-6">
                <Stars />
                <p className="flex-1 text-sm leading-relaxed text-muted">
                  &ldquo;{r.text}&rdquo;
                </p>
                <div className="flex items-center gap-3 border-t border-line pt-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.photo}
                    alt={r.name}
                    width={40}
                    height={40}
                    loading="lazy"
                    decoding="async"
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-tight text-foreground">
                      {r.name}
                    </div>
                    <div className="mt-0.5 text-xs leading-tight text-muted">
                      {r.role}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
