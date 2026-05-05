"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 py-16 bg-page text-foreground">
      <h1 className="text-xl font-semibold tracking-tight text-center">
        Something went wrong
      </h1>
      <p className="text-sm text-muted text-center max-w-md">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-5 py-2.5 rounded-xl bg-brand-violet hover:bg-brand-violet-hover text-white text-sm font-medium transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
