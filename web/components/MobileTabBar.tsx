"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Mobile-only bottom tab bar (hidden ≥md, where the top NavLinks take over).
const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/search", label: "Feed", icon: "feed" },
  { href: "/sources", label: "Experts", icon: "experts" },
  { href: "/saved", label: "Saved", icon: "saved" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

function TabIcon({ name }: { name: (typeof TABS)[number]["icon"] }) {
  const p = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "home") return <svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.7V21h14V9.7" /></svg>;
  if (name === "feed") return <svg {...p}><line x1="4" y1="5" x2="20" y2="5" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="19" x2="14" y2="19" /></svg>;
  if (name === "experts") return <svg {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" /></svg>;
  if (name === "saved") return <svg {...p}><polygon points="12 3 14.7 8.6 20.8 9.4 16.4 13.7 17.5 19.8 12 16.9 6.5 19.8 7.6 13.7 3.2 9.4 9.3 8.6 12 3" /></svg>;
  if (name === "settings") return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
  return <svg {...p}><line x1="4" y1="5" x2="20" y2="5" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="19" x2="14" y2="19" /></svg>;
}

export default function MobileTabBar() {
  const pathname = usePathname() || "/";
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 backdrop-blur"
      style={{ background: "var(--header-bg)", borderTop: "1px solid var(--border)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="grid grid-cols-5 h-14"> {/* Home · Feed · Experts · Saved · Settings */}
        {TABS.map((t) => {
          const active = isActive(t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className="flex flex-col items-center justify-center gap-0.5"
              style={{ color: active ? "var(--accent)" : "var(--muted)" }}>
              <span className="grid place-items-center rounded-full px-3 py-0.5"
                style={active ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)" } : {}}>
                <TabIcon name={t.icon} />
              </span>
              <span style={{ fontSize: 10, lineHeight: 1 }}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
