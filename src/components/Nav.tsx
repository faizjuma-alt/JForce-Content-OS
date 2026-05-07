"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard",  label: "Dashboard" },
  { href: "/campaigns",  label: "Campaigns" },
  { href: "/markets",    label: "Markets"   },
  { href: "/knowledge",  label: "Knowledge" },
  { href: "/settings",   label: "Settings"  },
];

export default function Nav({
  email,
  signOutAction,
}: {
  email: string;
  signOutAction: () => Promise<void>;
}) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-card/70 backdrop-blur">
      <div className="max-w-7xl mx-auto flex items-center justify-between p-4">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg brand-grad flex items-center justify-center font-extrabold text-white text-lg">J</div>
          <div>
            <div className="font-extrabold tracking-tight text-lg leading-none">
              <span>JUMIA</span> <span className="text-orange-100">FORCE</span>
            </div>
            <div className="text-xs text-soft">Faceless Reels Engine</div>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {TABS.map((t) => {
            const active = path === t.href || (t.href !== "/dashboard" && path?.startsWith(t.href));
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  active
                    ? "border-orange/40 bg-orange/10 text-orange-100"
                    : "border-transparent text-[#C5D0E0] hover:bg-white/5"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-xs text-soft hidden md:inline">{email}</span>
          <form action={signOutAction}>
            <button type="submit" className="btn-ghost text-xs">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
