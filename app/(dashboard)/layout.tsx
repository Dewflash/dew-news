import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

const NAV_LINKS = [
  { href: "/feed", label: "Feed" },
  { href: "/digest", label: "Digest" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/conflicts", label: "Conflicts" },
  { href: "/correlations", label: "Correlations" },
  { href: "/search", label: "Search" },
  { href: "/settings", label: "Settings" },
];

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-white/10 bg-card px-4 py-3">
        <span className="text-lg font-semibold text-white">dew-news</span>
        <nav className="hidden gap-4 text-sm text-gray-300 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="text-sm text-gray-400 hover:text-white"
          >
            {session?.user?.email} · Sign out
          </button>
        </form>
      </header>
      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
