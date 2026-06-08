import { NextResponse } from "next/server";

// Current temperature + weather emoji for the fixed set of world-clock cities,
// fetched from Open-Meteo in ONE multi-location call (keyless). Cached 30 min.
// The city list + order MUST match ALL_ZONES in components/AppHeader.tsx.

const CITIES: { city: string; lat: number; lon: number }[] = [
  { city: "Vancouver",    lat: 49.28, lon: -123.12 },
  { city: "Los Angeles",  lat: 34.05, lon: -118.24 },
  { city: "Denver",       lat: 39.74, lon: -104.99 },
  { city: "Chicago",      lat: 41.88, lon: -87.63  },
  { city: "New York",     lat: 40.71, lon: -74.01  },
  { city: "São Paulo",    lat: -23.55, lon: -46.63 },
  { city: "Buenos Aires", lat: -34.60, lon: -58.38 },
  { city: "Lisbon",       lat: 38.72, lon: -9.14   },
  { city: "London",       lat: 51.51, lon: -0.13   },
  { city: "Paris",        lat: 48.85, lon: 2.35     },
  { city: "Cairo",        lat: 30.04, lon: 31.24    },
  { city: "Dubai",        lat: 25.20, lon: 55.27    },
  { city: "Karachi",      lat: 24.86, lon: 67.00    },
  { city: "Bangkok",      lat: 13.76, lon: 100.50   },
  { city: "Singapore",    lat: 1.35,  lon: 103.82   },
  { city: "Tokyo",        lat: 35.68, lon: 139.69   },
  { city: "Sydney",       lat: -33.87, lon: 151.21  },
  { city: "Auckland",     lat: -36.85, lon: 174.76  },
];

const WMO_EMOJI: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️", 56: "🌧️", 57: "🌧️",
  61: "🌦️", 63: "🌧️", 65: "🌧️", 66: "🌧️", 67: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "❄️", 77: "🌨️",
  80: "🌦️", 81: "🌧️", 82: "⛈️", 85: "🌨️", 86: "❄️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

type CityWeather = { city: string; tempC: number; emoji: string };
const g = globalThis as unknown as { __cityWeather?: { at: number; data: CityWeather[] } };
const TTL = 30 * 60 * 1000;

export async function GET() {
  if (g.__cityWeather && Date.now() - g.__cityWeather.at < TTL) {
    return NextResponse.json(g.__cityWeather.data);
  }
  try {
    const lats = CITIES.map((c) => c.lat).join(",");
    const lons = CITIES.map((c) => c.lon).join(",");
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code`;
    const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const j = await res.json();
    const arr = Array.isArray(j) ? j : [j];
    const data: CityWeather[] = CITIES.map((c, i) => {
      const cur = arr[i]?.current;
      const code = Number(cur?.weather_code ?? 0);
      return { city: c.city, tempC: Math.round(Number(cur?.temperature_2m ?? 0)), emoji: WMO_EMOJI[code] ?? "🌡️" };
    });
    g.__cityWeather = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "city weather unavailable" }, { status: 502 });
  }
}
