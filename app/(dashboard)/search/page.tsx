import { Suspense } from "react";
import { SearchForm } from "@/components/search/SearchForm";
import { ItemCard } from "@/components/feed/ItemCard";
import { searchItems } from "@/lib/search";
import { ALL_CATEGORIES } from "@/lib/categories";

interface SearchPageProps {
  searchParams: {
    q?: string;
    category?: string;
    sentiment?: string;
    significance?: string;
    from?: string;
    to?: string;
  };
}

function formatDateHeading(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

async function SearchResults({ searchParams }: SearchPageProps) {
  const query = searchParams.q ?? "";
  if (!query.trim()) {
    return <p className="py-8 text-center text-gray-500">Enter a search term to get started.</p>;
  }

  let items = await searchItems(query);

  if (searchParams.category && ALL_CATEGORIES.includes(searchParams.category as never)) {
    items = items.filter(
      (i) => i.gics_sector === searchParams.category || i.secondary_categories.includes(searchParams.category!)
    );
  }
  if (searchParams.sentiment) {
    items = items.filter((i) => i.sentiment === searchParams.sentiment);
  }
  if (searchParams.significance) {
    const min = Number(searchParams.significance);
    items = items.filter((i) => i.significance >= min);
  }
  if (searchParams.from) {
    items = items.filter((i) => i.date >= searchParams.from!);
  }
  if (searchParams.to) {
    items = items.filter((i) => i.date <= searchParams.to!);
  }

  if (items.length === 0) {
    return <p className="py-8 text-center text-gray-500">No results for &quot;{query}&quot;.</p>;
  }

  const byDate = new Map<string, typeof items>();
  for (const item of items) {
    const group = byDate.get(item.date) ?? [];
    group.push(item);
    byDate.set(item.date, group);
  }
  const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {dates.map((date) => (
        <div key={date}>
          <h2 className="mb-2 text-sm font-semibold text-gray-400">{formatDateHeading(date)}</h2>
          <div className="space-y-3">
            {byDate.get(date)!.map((item) => (
              <ItemCard key={item.id} item={item} density="compact" showSentimentBadge showReadingTime />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-white">Search</h1>
      <Suspense>
        <SearchForm />
      </Suspense>
      <div className="mt-6">
        <Suspense>
          <SearchResults searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
