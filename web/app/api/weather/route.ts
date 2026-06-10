import { NextResponse } from "next/server";

export type HourlyItem = { time: string; code: number; emoji: string; tempC: number; precipPct: number; precipMm: number; windKph: number };
export type DailyItem  = { date: string; dayName: string; dayNum: number; code: number; emoji: string; tempMax: number; tempMin: number; precipPct: number; windMax: number };
export type WeatherData = { tempC: number; code: number; label: string; emoji: string; place: string; hourly: HourlyItem[]; daily: DailyItem[] };

const g = globalThis as unknown as { __weather?: Record<string, { at: number; data: WeatherData }> };
// Open-Meteo's `current` block updates every ~15 min; cache 10 min so an open tab
// reflects real-time changes without hammering the API.
const TTL = 10 * 60 * 1000;

const WMO: Record<number, [string, string]> = {
  0: ["Clear", "☀️"], 1: ["Mostly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  56: ["Freezing drizzle", "🌧️"], 57: ["Freezing drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"], 77: ["Snow grains", "🌨️"],
  80: ["Showers", "🌦️"], 81: ["Showers", "🌧️"], 82: ["Heavy showers", "⛈️"],
  85: ["Snow showers", "🌨️"], 86: ["Snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm", "⛈️"], 99: ["Thunderstorm", "⛈️"],
};

const DAY = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

async function reverseName(lat: number, lon: number): Promise<string> {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return j?.city || j?.locality || j?.principalSubdivision || "";
  } catch { return ""; }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  let lat = sp.has("lat") ? Number(sp.get("lat")) : NaN;
  let lon = sp.has("lon") ? Number(sp.get("lon")) : NaN;
  let place = "";
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    // Use Vercel's automatic IP geolocation headers as a no-permission-needed fallback.
    // These are set on every request in production; fall back to London in local dev.
    const ipLat = (req as unknown as { headers: { get(k: string): string | null } }).headers.get("x-vercel-ip-latitude");
    const ipLon = (req as unknown as { headers: { get(k: string): string | null } }).headers.get("x-vercel-ip-longitude");
    const ipCity = (req as unknown as { headers: { get(k: string): string | null } }).headers.get("x-vercel-ip-city");
    if (ipLat && ipLon && Number.isFinite(Number(ipLat))) {
      lat = Number(ipLat); lon = Number(ipLon);
      place = ipCity ? decodeURIComponent(ipCity) : "";
    } else {
      lat = 51.5074; lon = -0.1278; place = "London"; // local dev fallback
    }
  }

  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  g.__weather ??= {};
  const cached = g.__weather[key];
  // Invalidate cache if it's missing new fields (schema migration guard)
  if (cached && Date.now() - cached.at < TTL && cached.data.emoji) return NextResponse.json(cached.data);

  try {
    // Forecast comes from the UK MET OFFICE model (UKMO Global 10km + UKV 2km,
    // `ukmo_seamless`). Open-Meteo is only the free delivery API — the forecaster is
    // the Met Office, so values line up with BBC/Met Office rather than a blended model.
    const base = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code` +
      `&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=7`;
    let res = await fetch(base + "&models=ukmo_seamless", { signal: AbortSignal.timeout(8000) });
    let j = res.ok ? await res.json() : null;
    // Fallback: if the Met Office model has no reading for this point, use Open-Meteo's
    // auto best-match model so the widget still shows something rather than 0°.
    if (!j || j?.current?.temperature_2m == null) {
      res = await fetch(base, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`open-meteo ${res.status}`);
      j = await res.json();
    }

    // Current
    const code = Number(j?.current?.weather_code ?? 0);
    const tempC = Math.round(Number(j?.current?.temperature_2m ?? 0));
    const [label, emoji] = WMO[code] ?? ["—", "🌡️"];
    if (!place) place = await reverseName(lat, lon);

    // Hourly (next 24h from now)
    const hTimes: string[]  = j?.hourly?.time ?? [];
    const hTemps: number[]  = j?.hourly?.temperature_2m ?? [];
    const hCodes: number[]  = j?.hourly?.weather_code ?? [];
    const hPrecip: number[] = j?.hourly?.precipitation_probability ?? [];
    const hMm: number[]     = j?.hourly?.precipitation ?? [];
    const hWind: number[]   = j?.hourly?.wind_speed_10m ?? [];
    // Open-Meteo hourly times are in the location's LOCAL timezone (timezone=auto),
    // so compare against the API's own local "current.time" (also local), NOT a UTC
    // now() — otherwise the "NOW" column is off by the UTC offset (e.g. 1h in BST).
    const nowIso = String(j?.current?.time ?? "").slice(0, 13) || new Date().toISOString().slice(0, 13);
    let startIdx = hTimes.findIndex((t) => t.slice(0, 13) >= nowIso);
    if (startIdx < 0) startIdx = 0;
    const hourly: HourlyItem[] = hTimes.slice(startIdx, startIdx + 24).map((t, i) => {
      const idx = startIdx + i;
      const hCode = Number(hCodes[idx] ?? 0);
      const [, hEmoji] = WMO[hCode] ?? ["—", "🌡️"];
      return { time: t.slice(11, 16), code: hCode, emoji: hEmoji, tempC: Math.round(Number(hTemps[idx] ?? 0)), precipPct: Number(hPrecip[idx] ?? 0), precipMm: Math.round(Number(hMm[idx] ?? 0) * 10) / 10, windKph: Math.round(Number(hWind[idx] ?? 0)) };
    });

    // Daily (7 days)
    const dTimes: string[]   = j?.daily?.time ?? [];
    const dCodes: number[]   = j?.daily?.weather_code ?? [];
    const dMax: number[]     = j?.daily?.temperature_2m_max ?? [];
    const dMin: number[]     = j?.daily?.temperature_2m_min ?? [];
    const dPrecip: number[]  = j?.daily?.precipitation_probability_max ?? [];
    const dWind: number[]    = j?.daily?.wind_speed_10m_max ?? [];
    const daily: DailyItem[] = dTimes.map((t, i) => {
      const d = new Date(t + "T12:00:00");
      const dCode = Number(dCodes[i] ?? 0);
      const [, dEmoji] = WMO[dCode] ?? ["—", "🌡️"];
      return { date: t, dayName: DAY[d.getDay()], dayNum: d.getDate(), code: dCode, emoji: dEmoji, tempMax: Math.round(Number(dMax[i] ?? 0)), tempMin: Math.round(Number(dMin[i] ?? 0)), precipPct: Number(dPrecip[i] ?? 0), windMax: Math.round(Number(dWind[i] ?? 0)) };
    });

    const data: WeatherData = { tempC, code, label, emoji, place, hourly, daily };
    g.__weather[key] = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "weather unavailable" }, { status: 502 });
  }
}
