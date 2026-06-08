"use client";
import { useEffect, useState } from "react";
export type HourlyItem = { time: string; code: number; emoji: string; tempC: number; precipPct: number; precipMm: number; windKph: number };
export type DailyItem  = { date: string; dayName: string; dayNum: number; code: number; emoji: string; tempMax: number; tempMin: number; precipPct: number; windMax: number };
export type WeatherData = { tempC: number; code: number; label: string; emoji: string; place: string; hourly: HourlyItem[]; daily: DailyItem[] };
type Geo = { lat: number; lon: number; at: number };
const GEO_KEY = "jotter.geo.v1";
const GEO_TTL = 24 * 60 * 60 * 1000;

type Section = "weather" | "date" | "time";

type Props = {
  activeSection: Section | null;
  onToggle: (s: Section) => void;
  onWeatherData: (d: WeatherData) => void;
};

function fmtDate(d: Date): string {
  return `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "long" })}`;
}

const dot = <span aria-hidden className="select-none" style={{ color: "var(--border-hover)" }}>·</span>;

export default function WeatherClock({ activeSection, onToggle, onWeatherData }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchWeather = (q: string) =>
      fetch(`/api/weather${q}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d && !d.error) {
            setWeather(d);
            onWeatherData(d);
          }
        })
        .catch(() => {});

    let cached: Geo | null = null;
    try { cached = JSON.parse(localStorage.getItem(GEO_KEY) || "null"); } catch {}
    if (cached && Date.now() - cached.at < GEO_TTL) {
      fetchWeather(`?lat=${cached.lat}&lon=${cached.lon}`);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const geo: Geo = { lat: pos.coords.latitude, lon: pos.coords.longitude, at: Date.now() };
          try { localStorage.setItem(GEO_KEY, JSON.stringify(geo)); } catch {}
          fetchWeather(`?lat=${geo.lat}&lon=${geo.lon}`);
        },
        () => fetchWeather(""),
        { timeout: 8000, maximumAge: GEO_TTL }
      );
    } else {
      fetchWeather("");
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!now) return null;
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const sectionBtn = (section: Section, content: React.ReactNode) => (
    <button
      onClick={() => onToggle(section)}
      className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      style={{ color: activeSection === section ? "var(--accent)" : "inherit", background: "none", border: "none", padding: 0, cursor: "pointer" }}
    >
      {content}
    </button>
  );

  return (
    <div
      className="weather-pill hidden md:flex items-center gap-3 text-sm px-3 py-1 select-none"
      style={{
        border: `1px solid ${activeSection ? "var(--accent)" : "var(--border)"}`,
        background: "var(--panel-2)",
        color: "var(--text)",
      }}
    >
      {weather && (
        <>
          {sectionBtn("weather", (
            <>
              <span aria-hidden style={{ filter: "grayscale(0.2)" }}>{weather.emoji}</span>
              <span>{weather.tempC}°</span>
            </>
          ))}
          {dot}
        </>
      )}
      {sectionBtn("date", <span>{fmtDate(now)}</span>)}
      {dot}
      {sectionBtn("time", <span className="tabular-nums">{time}</span>)}
    </div>
  );
}
