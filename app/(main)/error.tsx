"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background text-foreground">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground text-sm text-center max-w-md">
        {process.env.NODE_ENV === "development" ? error.message : "Please try again in a moment."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Try again
      </button>
    </div>
  );
}
