"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Feed" },
  { href: "/sources", label: "Experts" },
  { href: "/saved", label: "Saved" },
];

export default function NavLinks() {
  const pathname = usePathname() || "/";
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {NAV.map((n) => {
        const active = isActive(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className="px-3 py-1.5 rounded-lg text-sm hover:bg-[var(--panel-2)]"
            style={active
              ? { background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }
              : { color: "var(--muted)" }}
          >
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
