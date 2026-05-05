"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          fontFamily:
            'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          background: "#06050e",
          color: "#e8eaf2",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "0.875rem",
            opacity: 0.85,
            textAlign: "center",
            maxWidth: "28rem",
          }}
        >
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            padding: "0.625rem 1.25rem",
            borderRadius: "0.75rem",
            border: "none",
            background: "#7c3aed",
            color: "#fff",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
