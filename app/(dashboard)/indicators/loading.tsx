import { Skeleton } from "@/components/ui/Skeleton";

export default function IndicatorsLoading() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Macro Indicators</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}
