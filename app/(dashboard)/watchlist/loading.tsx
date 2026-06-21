import { Skeleton } from "@/components/ui/Skeleton";

export default function WatchlistLoading() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Watchlist</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}
