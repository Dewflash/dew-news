"use client";

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-lg font-semibold text-white">Something went wrong</p>
      <p className="max-w-sm text-sm text-gray-400">{error.message || "An unexpected error occurred."}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80"
      >
        Try again
      </button>
    </div>
  );
}
