"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Mobile-only bottom tab bar (hidden ≥md, where the top NavLinks take over).
// Settings moved to the header (top right); the 5th slot is the radio toggle.
const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/search", label: "Feed", icon: "feed" },
  { href: "/sources", label: "Experts", icon: "experts" },
  { href: "/saved", label: "Saved", icon: "saved" },
] as const;

type IconName = (typeof TABS)[number]["icon"] | "radio";
function TabIcon({ name }: { name: IconName }) {
  const p = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "home") return <svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.7V21h14V9.7" /></svg>;
  if (name === "feed") return <svg {...p}><line x1="4" y1="5" x2="20" y2="5" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="19" x2="14" y2="19" /></svg>;
  if (name === "experts") return <svg {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" /></svg>;
  if (name === "saved") return <svg {...p}><polygon points="12 3 14.7 8.6 20.8 9.4 16.4 13.7 17.5 19.8 12 16.9 6.5 19.8 7.6 13.7 3.2 9.4 9.3 8.6 12 3" /></svg>;
  if (name === "radio") return <svg {...p}><path d="M4 10v4" /><path d="M8 7v10" /><path d="M12 4v16" /><path d="M16 7v10" /><path d="M20 10v4" /></svg>;
  return <svg {...p}><line x1="4" y1="5" x2="20" y2="5" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="19" x2="14" y2="19" /></svg>;
}

export default function MobileTabBar() {
  const pathname = usePathname() || "/";
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  // Mirror the radio's playing state so the radio tab lights up when on air.
  const [radioOn, setRadioOn] = useState(false);
  useEffect(() => {
    const onState = (e: Event) => setRadioOn(Boolean((e as CustomEvent).detail?.playing));
    window.addEventListener("jotter-radio-state", onState);
    return () => window.removeEventListener("jotter-radio-state", onState);
  }, []);

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 backdrop-blur"
      style={{ background: "var(--header-bg)", borderTop: "1px solid var(--border)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="grid grid-cols-5 h-14"> {/* Home · Feed · Experts · Saved · Radio */}
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
        {/* Radio toggle (opens the bottom sheet); lights up while playing */}
        <button onClick={() => window.dispatchEvent(new Event("jotter-radio-toggle"))}
          className="flex flex-col items-center justify-center gap-0.5"
          style={{ color: radioOn ? "var(--accent)" : "var(--muted)" }} aria-label="Radio">
          <span className="grid place-items-center rounded-full px-3 py-0.5"
            style={radioOn ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)" } : {}}>
            <TabIcon name="radio" />
          </span>
          <span style={{ fontSize: 10, lineHeight: 1 }}>Radio</span>
        </button>
      </div>
    </nav>
  );
}
