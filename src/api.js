// src/api.js

// --- OpenWeather config ---
const OWM_KEY = import.meta.env.VITE_OWM_API_KEY;
const ONECALL_BASE = "https://api.openweathermap.org/data/3.0/onecall";
const GEO_BASE = "https://api.openweathermap.org/geo/1.0/direct";

// ---------- helpers ----------
function normalizeQuery(q) {
  return (q || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}
function ensureCountry(q, country = "GH") {
  // if the query already has a comma (likely "City, XX"), keep it as is
  if (/,/.test(q)) return q;
  return `${q}, ${country}`;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    // try to extract OWM error body
    let body = "";
    try { body = await res.text(); } catch {}
    const msg = body || `HTTP ${res.status}`;
    throw new Error(`OpenWeather error: ${msg}`);
  }
  return res.json();
}

// ---------- Geocoding (city -> lat/lon) ----------
export async function fetchCoords(rawQuery) {
  const q0 = normalizeQuery(rawQuery);
  if (!q0) throw new Error("Please enter a city");

  // We’ll try the raw query first, then default to Ghana ("City, GH")
  const tries = [
    q0,                     // e.g. "koforidua"
    ensureCountry(q0, "GH") // e.g. "koforidua, GH"
  ];

  for (const q of tries) {
    const url = `${GEO_BASE}?q=${encodeURIComponent(q)}&limit=5&appid=${OWM_KEY}`;
    try {
      const arr = await getJson(url);
      if (Array.isArray(arr) && arr.length > 0) {
        const top = arr[0];
        return {
          lat: top.lat,
          lon: top.lon,
          label: [top.name, top.state, top.country].filter(Boolean).join(", ")
        };
      }
    } catch {
      // ignore and try next format
    }
  }

  throw new Error('City not found. Try adding the country (e.g., "Koforidua, GH").');
}

// ---------- Weather (OneCall 3.0) ----------
export async function fetchOneCall({ lat, lon, units = "metric" }) {
  if (lat == null || lon == null) throw new Error("Missing coordinates");
  const url =
    `${ONECALL_BASE}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}` +
    `&units=${encodeURIComponent(units)}&exclude=minutely,alerts&appid=${OWM_KEY}`;

  // Better error messages for common cases
  const res = await fetch(url);
  if (!res.ok) {
    let text = "";
    try { text = await res.text(); } catch {}
    if (res.status === 401) {
      throw new Error('Invalid API key (401). Double-check VITE_OWM_API_KEY.');
    }
    throw new Error(text || `Weather fetch failed (${res.status})`);
  }
  return res.json();
}

// ---------- "Will it rain today?" analysis ----------
// Uses daily[0] as the primary signal, then scans hourly (next 24h) for a first rainy hour.
// Returns a consistent object so the UI can always render.
export function analyzeRainToday(onecall) {
  if (!onecall) return { willRain: false, chance: 0, when: "", amount: 0 };

  const daily0 = onecall.daily?.[0] || null;
  let chance = 0;  // %
  let amount = 0;  // mm (approx)
  let when = "";   // "HH:MM" local to the location

  if (daily0) {
    // daily.pop is 0..1 probability for the day
    chance = Math.round(((daily0.pop ?? 0) * 100));
    // daily.rain is total expected mm for the day (not always present)
    amount = Number.isFinite(daily0.rain) ? daily0.rain : 0;
  }

  // Try to find the first rainy hour in the next 24 hours
  const offset = onecall.timezone_offset || 0; // seconds shift from UTC for this location
  const nowUtc = Math.floor(Date.now() / 1000);
  const endUtc = nowUtc + 24 * 3600;

  if (onecall.hourly?.length) {
    for (const h of onecall.hourly) {
      if (h.dt < nowUtc || h.dt > endUtc) continue;
      const pop = h.pop ?? 0; // 0..1
      const code = h.weather?.[0]?.id || 0;
      const hrAmount = (h.rain?.["1h"] ?? 0) + (h.snow?.["1h"] ?? 0);
      const rainyCode = code >= 200 && code < 600; // thunder/drizzle/rain

      // modest thresholds to call out likely rain in an hour
      if (rainyCode || hrAmount > 0 || pop >= 0.3) {
        const t = new Date((h.dt + offset) * 1000);
        const hh = t.getUTCHours().toString().padStart(2, "0");
        const mm = t.getUTCMinutes().toString().padStart(2, "0");
        when = `${hh}:${mm}`;
        if (!amount && hrAmount) amount = hrAmount;
        break;
      }
    }

    // If daily missing, backfill chance with max hourly pop in the window
    if (!daily0) {
      let maxPop = 0;
      for (const h of onecall.hourly) {
        if (h.dt < nowUtc || h.dt > endUtc) continue;
        maxPop = Math.max(maxPop, h.pop ?? 0);
      }
      chance = Math.round(maxPop * 100);
    }
  }

  const willRain = chance >= 30 || amount > 0 || when !== "";
  return { willRain, chance, when, amount };
}
