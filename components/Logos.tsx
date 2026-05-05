export function Logos() {
  return (
    <section className="py-10 sm:py-12">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Trusted by teams who ship video
        </div>

        <div className="mt-6 flex justify-center">
          <img
            src="/trusted-logos.png"
            alt="Google, Netflix, Meta, Amazon, and Microsoft"
            className="trusted-logos-strip h-[2.4rem] w-full max-w-7xl object-contain object-center sm:h-[2.8rem] md:h-[3.2rem] lg:h-16 xl:h-[4.8rem]"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}
