import { Skeleton } from "@/components/ui/Skeleton";

export default function ConflictsLoading() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Conflicts</h1>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-card p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
