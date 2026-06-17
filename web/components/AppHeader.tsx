"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import NavLinks from "@/components/NavLinks";
import ThemeToggle from "@/components/ThemeToggle";
import WeatherClock, { type WeatherData } from "@/components/WeatherClock";

type Section = "weather" | "date" | "time";
type WeatherTab = "hourly" | "daily" | "rain" | "wind";

const PANEL_H = 220; // px — shared height for all panels

// ── Shared mini-control styles ─────────────────────────────────────────────────
const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: "2px 10px", borderRadius: 999, fontSize: 11, cursor: "pointer", border: "none",
  background: active ? "var(--accent)" : "transparent",
  color: active ? "var(--on-accent)" : "var(--muted)",
  fontWeight: active ? 600 : 400,
});
const arrowBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: "0 6px",
  color: "var(--muted)", fontSize: 14, lineHeight: 1,
};

// Scroll a horizontal strip by `delta` px. Native scrollBy({behavior:"smooth"})
// and rAF-driven scrollLeft are both silently dropped in this Turbopack/browser
// combo, but a direct synchronous scrollLeft assignment sticks — so use that.
function smoothScrollBy(el: HTMLElement, delta: number) {
  const max = el.scrollWidth - el.clientWidth;
  el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + delta));
}

// ── Weather panel ──────────────────────────────────────────────────────────────
function WeatherPanel({ data }: { data: WeatherData }) {
  const [tab, setTab] = useState<WeatherTab>("hourly");
  const { hourly, daily, place } = data;
  if (!hourly.length) return <p className="label">Loading forecast…</p>;

  // Hourly shows 12h; other tabs use full dataset
  const hourly12 = hourly.slice(0, 12);
  const maxPrecip = Math.max(...hourly.map((h) => h.precipPct), 10);
  const maxWind   = Math.max(...hourly.map((h) => h.windKph),   10);
  const cols = tab === "daily" ? daily.length : (tab === "hourly" ? 12 : hourly.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: PANEL_H + 40 }}>
      {/* Grid content — fills available space above footer.
          ≤md the .hdr-cols rule in globals.css turns this into a swipeable strip. */}
      <div className="hdr-cols" style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 0, minHeight: 0 }}>
        {tab === "hourly" && hourly12.map((h, i) => (
          <div key={i} className="flex flex-col items-center justify-between py-2 rounded-lg"
            style={{ background: i === 0 ? "var(--panel-2)" : "transparent" }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>{i === 0 ? "NOW" : h.time}</span>
            <span style={{ fontSize: "1.75rem", lineHeight: 1 }}>{h.emoji}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{h.tempC}°</span>
            <span style={{ fontSize: 10, color: h.precipPct >= 20 ? "var(--accent-2)" : "transparent" }}>{h.precipPct}%</span>
          </div>
        ))}

        {tab === "daily" && daily.map((d, i) => (
          <div key={i} className="flex flex-col items-center justify-between py-2 rounded-lg"
            style={{ background: i === 0 ? "var(--panel-2)" : "transparent" }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>{d.dayName.toUpperCase()}</span>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>{d.dayNum}</span>
            <span style={{ fontSize: "1.75rem", lineHeight: 1 }}>{d.emoji}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{d.tempMax}°</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{d.tempMin}°</span>
            {d.precipPct >= 20
              ? <span style={{ fontSize: 10, color: "var(--accent-2)" }}>{d.precipPct}%</span>
              : <span style={{ fontSize: 10, opacity: 0 }}>–</span>}
          </div>
        ))}

        {tab === "rain" && hourly.map((h, i) => (
          <div key={i} className="flex flex-col items-center rounded-lg"
            style={{ background: i === 0 ? "var(--panel-2)" : "transparent", paddingTop: 8, paddingBottom: 8 }}>
            <span style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>{i === 0 ? "NOW" : h.time}</span>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "60%", minHeight: 0 }}>
              <div style={{ height: `${Math.round((h.precipPct / maxPrecip) * 100)}%`, minHeight: h.precipPct > 0 ? 2 : 0, background: `color-mix(in srgb, var(--accent-2) ${40 + Math.round(h.precipPct * 0.6)}%, transparent)`, borderRadius: "3px 3px 0 0", width: "100%" }} />
            </div>
            <span style={{ fontSize: 10, color: h.precipPct >= 10 ? "var(--accent-2)" : "transparent", marginTop: 3 }}>{h.precipPct}%</span>
            {h.precipMm > 0 ? <span style={{ fontSize: 9, color: "var(--muted)" }}>{h.precipMm}mm</span> : <span style={{ fontSize: 9, opacity: 0 }}>–</span>}
          </div>
        ))}

        {tab === "wind" && hourly.map((h, i) => (
          <div key={i} className="flex flex-col items-center justify-between py-2 rounded-lg"
            style={{ background: i === 0 ? "var(--panel-2)" : "transparent" }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>{i === 0 ? "NOW" : h.time}</span>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "50%", marginTop: 4, marginBottom: 4, minHeight: 0 }}>
              <div style={{ height: `${Math.round((h.windKph / maxWind) * 100)}%`, minHeight: 2, background: `color-mix(in srgb, var(--accent) ${30 + Math.round((h.windKph / maxWind) * 70)}%, transparent)`, borderRadius: "3px 3px 0 0", width: "100%" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600 }}>{h.windKph}</span>
            <span style={{ fontSize: 9, color: "var(--muted)" }}>km/h</span>
          </div>
        ))}
      </div>

      {/* Footer: place · tab switcher · full forecast link */}
      <div className="flex flex-wrap items-center justify-between pt-2 mt-1 gap-x-3 gap-y-1" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="label shrink-0">{place || "Local forecast"}</span>
        <div className="flex items-center gap-1">
          {(["hourly","daily","rain","wind"] as WeatherTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <a href="https://www.bbc.co.uk/weather/2643743" target="_blank" rel="noopener noreferrer"
          className="label hover:underline shrink-0" style={{ color: "var(--accent-2)", textTransform: "none", letterSpacing: 0 }}>
          Full forecast ↗︎
        </a>
      </div>
    </div>
  );
}

// ── Calendar panel (scrollable months) ────────────────────────────────────────
function MonthGrid({ year, month, today, width }: { year: number; month: number; today: Date; width: number }) {
  const monthName = new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const days: (number | null)[] = [...Array(startOffset).fill(null)];
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  const isToday = (d: number | null) =>
    d !== null && d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div style={{ width, flexShrink: 0, paddingLeft: 16, paddingRight: 16, boxSizing: "border-box" }}>
      <div className="text-sm font-medium mb-3 text-center">{monthName}</div>
      <div className="grid grid-cols-7 gap-px text-center">
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map((d, i) => (
          <div key={i} style={{ fontSize: 10, color: "var(--muted)", paddingBottom: 6 }}>{d}</div>
        ))}
        {days.map((d, i) => (
          <div key={i} className="flex items-center justify-center mx-auto rounded-full"
            style={{
              width: "1.75rem", height: "1.75rem",
              background: isToday(d) ? "var(--accent)" : "transparent",
              color: isToday(d) ? "var(--on-accent)" : d ? "var(--text)" : "transparent",
              fontWeight: isToday(d) ? 700 : 400,
              fontSize: 12,
            }}
          >
            {d ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarPanel() {
  const today    = new Date();
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  // Build 12 months: 3 back through 8 forward (so you can scroll into the past)
  const BACK = 3;
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - BACK + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Measure the container width (one "page" = 2 months = full width)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerW(el.clientWidth);
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Once measured, scroll to show the current + next month (3 months sit to the left)
  useEffect(() => {
    if (containerW === 0) return;
    const el = scrollRef.current;
    if (el) el.scrollLeft = BACK * (containerW / 2);
  }, [containerW]);

  const colW = containerW > 0 ? containerW / 2 : 300;

  const scroll = (dir: -1 | 1) => {
    if (scrollRef.current) smoothScrollBy(scrollRef.current, dir * colW);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", height: PANEL_H + 40 }}>
      {/* Arrows */}
      <button onClick={() => scroll(-1)} style={{ ...arrowBtn, position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)", zIndex: 2 }}>‹</button>
      <button onClick={() => scroll(1)}  style={{ ...arrowBtn, position: "absolute", right: -4, top: "50%", transform: "translateY(-50%)", zIndex: 2 }}>›</button>

      {/* Scrollable months — no scroll-snap (it fought the 1-month arrow step) */}
      <div ref={scrollRef} style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", height: "100%" }} className="no-scrollbar">
        {containerW > 0 && months.map(({ year, month }, i) => (
          <div key={i} style={{ flexShrink: 0, width: colW }}>
            <MonthGrid year={year} month={month} today={today} width={colW} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Timezones panel ────────────────────────────────────────────────────────────
// Single flat list west→east. London (index 8) is the home city.
// On mount the scroll is centred on London so it's always in the middle.
const ALL_ZONES = [
  { city: "Vancouver",    tz: "America/Vancouver"              },
  { city: "Los Angeles",  tz: "America/Los_Angeles"            },
  { city: "Denver",       tz: "America/Denver"                 },
  { city: "Chicago",      tz: "America/Chicago"                },
  { city: "New York",     tz: "America/New_York"               },
  { city: "São Paulo",    tz: "America/Sao_Paulo"              },
  { city: "Buenos Aires", tz: "America/Argentina/Buenos_Aires" },
  { city: "Lisbon",       tz: "Europe/Lisbon"                  },
  { city: "London",       tz: "Europe/London", home: true      }, // index 8 — centred
  { city: "Paris",        tz: "Europe/Paris"                   },
  { city: "Cairo",        tz: "Africa/Cairo"                   },
  { city: "Dubai",        tz: "Asia/Dubai"                     },
  { city: "Karachi",      tz: "Asia/Karachi"                   }, // UTC+5 full hour
  { city: "Bangkok",      tz: "Asia/Bangkok"                   },
  { city: "Singapore",    tz: "Asia/Singapore"                 },
  { city: "Tokyo",        tz: "Asia/Tokyo"                     },
  { city: "Sydney",       tz: "Australia/Sydney"               },
  { city: "Auckland",     tz: "Pacific/Auckland"               },
];
const LONDON_IDX = ALL_ZONES.findIndex((z) => z.home);

type CityWeather = { city: string; tempC: number; emoji: string };

// Cities visible at once: 11 on desktop, 4 on phone-width screens.
function useVisibleCols() {
  const [cols, setCols] = useState(11);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setCols(mq.matches ? 4 : 11);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return cols;
}

function TimezonesPanel() {
  const [now, setNow] = useState(new Date());
  const [wx, setWx] = useState<Record<string, CityWeather>>({});
  const visibleCols = useVisibleCols();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Fetch current temp + icon for every city (one batched call, cached server-side)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/city-weather")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CityWeather[] | null) => {
        if (cancelled || !d || !Array.isArray(d)) return;
        setWx(Object.fromEntries(d.map((c) => [c.city, c])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Centre London after first paint — use clientWidth (flex cols = 1/visibleCols of container)
  useEffect(() => {
    const id = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const colW = el.clientWidth / visibleCols;
      el.scrollLeft = (LONDON_IDX - Math.floor(visibleCols / 2)) * colW;
    }, 30);
    return () => clearTimeout(id);
  }, [visibleCols]);

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (el) smoothScrollBy(el, dir * (el.clientWidth / visibleCols) * 3);
  };

  const londonDate = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

  return (
    <div style={{ height: PANEL_H + 40, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      {/* Scrollable city strip */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <button onClick={() => scrollBy(-1)} style={{ ...arrowBtn, position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)", zIndex: 2 }}>‹</button>
        <button onClick={() => scrollBy(1)}  style={{ ...arrowBtn, position: "absolute", right: -4, top: "50%", transform: "translateY(-50%)", zIndex: 2 }}>›</button>
        {/* Flex row: each cell = 1/VISIBLE_COLS of the container, so exactly VISIBLE_COLS fit */}
        <div ref={scrollRef} className="no-scrollbar"
          style={{ overflowX: "auto", height: "100%", display: "flex" }}>
          {ALL_ZONES.map(({ city, tz, home }) => {
            const time    = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
            const tzDate  = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz });
            const diffDay = tzDate !== londonDate;
            const cw      = wx[city];
            return (
              <div key={city}
                className="flex flex-col items-center justify-center gap-0.5 rounded-lg py-3 shrink-0"
                style={{ width: `${100 / visibleCols}%`, background: home ? "var(--panel-2)" : "transparent" }}>
                <span style={{ fontSize: 10, letterSpacing: "0.06em", color: home ? "var(--accent)" : "var(--muted)" }}>
                  {city.toUpperCase()}
                </span>
                <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color: home ? "var(--accent)" : "var(--text)" }}>
                  {time}
                </span>
                {diffDay
                  ? <span style={{ fontSize: 9, color: "var(--muted)" }}>{tzDate}</span>
                  : <span style={{ fontSize: 9, opacity: 0 }}>–</span>}
                {/* Current conditions for the city */}
                <span style={{ fontSize: 12, marginTop: 2, display: "flex", alignItems: "center", gap: 3, color: "var(--muted)", minHeight: 16 }}>
                  {cw ? <><span aria-hidden style={{ fontSize: 13 }}>{cw.emoji}</span>{cw.tempC}°</> : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ── App header ─────────────────────────────────────────────────────────────────
export default function AppHeader() {
  const [section,     setSection]     = useState<Section | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const toggle = (s: Section) => setSection((cur) => (cur === s ? null : s));

  // Settings gear is a toggle: open /settings, or press again to close (go back).
  const router = useRouter();
  const pathname = usePathname();
  const onSettings = pathname === "/settings";
  const toggleSettings = () => { if (onSettings) router.back(); else router.push("/settings"); };

  return (
    <header className="sticky top-0 z-50 backdrop-blur"
      style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--border)" }}>
      {/* Nav row */}
      <div className="mx-auto max-w-6xl px-5 max-md:px-3 h-14 flex items-center justify-between gap-4 max-md:gap-2">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Logo size={26} />
          <span className="font-semibold tracking-tight">Jotter</span>
          <span className="font-semibold tracking-tight" style={{ color: "var(--muted)" }}>Intelligence</span>
        </Link>
        <WeatherClock activeSection={section} onToggle={toggle} onWeatherData={setWeatherData} />
        {/* On mobile the weather/time pill is hidden (the phone shows the time, weather
            is a glance away), so the three controls spread across the freed space. */}
        <nav className="flex items-center gap-1 shrink-0 max-md:flex-1 max-md:justify-end max-md:gap-2">
          <div className="hidden md:flex items-center gap-1"><NavLinks /></div>
          <ThemeToggle />
          {/* mobile-only: settings toggle (open, or press again to close) */}
          <button onClick={toggleSettings} title={onSettings ? "Close settings" : "Settings"}
            aria-pressed={onSettings}
            className="md:hidden w-8 h-8 grid place-items-center rounded-lg"
            style={{ color: onSettings ? "var(--accent)" : "var(--muted)" }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </nav>
      </div>

      {/* Expansion panel — animates open/close via max-height */}
      <div style={{
        overflow: "hidden",
        maxHeight: section ? "600px" : "0px",
        transition: "max-height 380ms cubic-bezier(0.4, 0, 0.2, 1)",
        borderTop: section ? "1px solid var(--border)" : "none",
      }}>
        <div className="mx-auto max-w-6xl px-5 py-4">
          {section === "weather" && weatherData && <WeatherPanel data={weatherData} />}
          {section === "weather" && !weatherData && <p className="label py-4">Loading…</p>}
          {section === "date" && <CalendarPanel />}
          {section === "time" && <TimezonesPanel />}
        </div>
      </div>
    </header>
  );
}
