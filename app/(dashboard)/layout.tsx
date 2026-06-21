import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/user";

const NAV_LINKS = [
  { href: "/feed", label: "Feed" },
  { href: "/digest", label: "Digest" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/conflicts", label: "Conflicts" },
  { href: "/correlations", label: "Correlations" },
  { href: "/search", label: "Search" },
  { href: "/indicators", label: "Indicators" },
  { href: "/settings", label: "Settings" },
];

/** Section 12.4: orange badge for unacknowledged conflicts, blue for active (non-dismissed) correlations. */
const BADGE_COLOUR: Record<string, string> = {
  "/conflicts": "bg-amber-500",
  "/correlations": "bg-accent",
};

/** Section 9.1: mobile bottom tab bar covers the 5 most-used views. */
const MOBILE_NAV_LINKS = [
  { href: "/feed", label: "Feed", icon: "📰" },
  { href: "/digest", label: "Digest", icon: "🗞️" },
  { href: "/watchlist", label: "Watchlist", icon: "⭐" },
  { href: "/search", label: "Search", icon: "🔍" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const supabase = createServiceClient();
  const userId = await getUserId(supabase);
  const { count: unacknowledgedConflicts } = await supabase
    .from("conflicts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("acknowledged", false)
    .eq("is_resolved", false);
  const { count: activeCorrelations } = await supabase
    .from("correlations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_dismissed", false);

  const badgeCounts: Record<string, number> = {
    "/conflicts": unacknowledgedConflicts ?? 0,
    "/correlations": activeCorrelations ?? 0,
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 bg-card px-4 py-3">
        <span className="shrink-0 text-lg font-semibold text-white">dew-news</span>
        <nav className="hidden gap-4 text-sm text-gray-300 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="flex items-center gap-1.5 hover:text-white">
              {link.label}
              {badgeCounts[link.href] > 0 && (
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold text-white ${BADGE_COLOUR[link.href]}`}
                >
                  {badgeCounts[link.href]}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="min-w-0"
        >
          <button type="submit" className="block max-w-[55vw] truncate text-sm text-gray-400 hover:text-white sm:max-w-none">
            {session?.user?.email} · Sign out
          </button>
        </form>
      </header>
      <main className="flex-1 px-4 py-6 pb-20 sm:pb-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-white/10 bg-card sm:hidden">
        {MOBILE_NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-gray-400 hover:text-white"
          >
            <span className="text-base">{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
