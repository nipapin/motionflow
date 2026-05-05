/** Large page grid behind content (scrolls with page) */

export function EditorialBackdrop() {
  return (
    <div
      className="editorial-backdrop-root pointer-events-none absolute inset-0 z-0 min-h-full overflow-hidden"
      aria-hidden="true"
    >
      <div className="editorial-grid-backdrop__pattern pointer-events-none absolute inset-0" />
      <div className="editorial-grid-backdrop__fade pointer-events-none absolute inset-0" />
    </div>
  );
}
