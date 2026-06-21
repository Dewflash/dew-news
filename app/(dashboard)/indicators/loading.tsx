import { Skeleton } from "@/components/ui/Skeleton";

export default function IndicatorsLoading() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Macro Indicators</h1>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
