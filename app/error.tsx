"use client";

export default function RootError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-center">
        <p className="text-lg font-semibold text-white">Something went wrong</p>
        <p className="max-w-sm text-sm text-gray-400">{error.message || "An unexpected error occurred."}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-2 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
