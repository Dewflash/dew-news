import { Skeleton } from "@/components/ui/Skeleton";

export default function SearchLoading() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Search</h1>
      <Skeleton className="h-10 w-full" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}
