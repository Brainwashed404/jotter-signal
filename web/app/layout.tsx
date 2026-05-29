import type { Metadata } from "next";
import Link from "next/link";
import { getRadar } from "@/lib/data";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

const THEME_INIT = `try{if(localStorage.getItem('jotter.theme')==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}`;

export const metadata: Metadata = {
  title: "Jotter Signal — Foresight Engine",
  description: "Turning the world's sharpest minds into thought leadership.",
};

const NAV = [
  { href: "/", label: "Latest" },
  { href: "/search", label: "Workbench" },
  { href: "/generate", label: "Generator" },
  { href: "/sources", label: "Sensors" },
  { href: "/saved", label: "Saved" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const r = getRadar();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <header
          className="sticky top-0 z-50 backdrop-blur"
          style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="mx-auto max-w-6xl px-5 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg" style={{ color: "var(--accent)" }}>◭</span>
              <span className="font-semibold tracking-tight">Jotter</span>
              <span className="mono text-xs" style={{ color: "var(--muted)" }}>SIGNAL</span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-3 py-1.5 rounded-lg text-sm hover:bg-[var(--panel-2)]"
                  style={{ color: "var(--muted)" }}
                >
                  {n.label}
                </Link>
              ))}
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-5 py-8 flex-1">{children}</main>
        <footer
          className="mx-auto w-full max-w-6xl px-5 py-6 mono text-xs"
          style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}
        >
          {r.totals.signals.toLocaleString()} signals · {r.totals.posts.toLocaleString()} posts ·{" "}
          {r.totals.date_min} → {r.totals.date_max} · 1 sensor active
        </footer>
      </body>
    </html>
  );
}
