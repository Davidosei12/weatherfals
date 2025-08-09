// src/api.js

const OWM_KEY = import.meta.env.VITE_OWM_API_KEY;
const OWM_BASE = "https://api.openweathermap.org";

// ---------- helpers ----------
function normalizeQuery(q) {
  return (q || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureCountry(q, country = "GH") {
  if (/,/.test(q)) return q; // already has comma (likely country/state)
  return `${q}, ${country}`;
}

async function safeJsonFetch(url, label = "Request") {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `${label} failed (${res.status})`;
    try { msg += `: ${await res.text()}`; } catch {}
    if (res.status === 401) {
      throw new Error("OpenWeather API key rejected (401). Check VITE_OWM_API_KEY.");
    }
    if (res.status === 404) {
      throw new Error("City not found. Try “City, CC” (e.g., Koforidua, GH).");
    }
    throw new Error(msg);
  }
  return res.json();
}

// ---------- geocoding ----------
export async function fetchCoords(rawQuery) {
  const q0 = normalizeQuery(rawQuery);
  if (!q0) throw new Error("Please enter a city");

  const tries = [q0, ensureCountry(q0, "GH")];

  for (const q of tries) {
    const url = `${OWM_BASE}/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=5&appid=${OWM_KEY}`;
    const arr = await safeJsonFetch(url, "Geocoding");
    if (Array.isArray(arr) && arr.length > 0) {
      const top = arr[0];
      return {
        lat: top.lat,
        lon: top.lon,
        label: [top.name, top.state, top.country].filter(Boolean).join(", "),
      };
    }
  }
  throw new Error('City not found. Try adding the country (e.g., "Koforidua, GH").');
}

// ---------- weather (onecall with v3→v2.5 fallback) ----------
export async function fetchOneCall({ lat, lon, units = "metric" }) {
  if (!lat || !lon) throw new Error("Missing coordinates");
  const v3 = `${OWM_BASE}/data/3.0/onecall?lat=${lat}&lon=${lon}&units=${units}&exclude=minutely,alerts&appid=${OWM_KEY}`;
  try {
    return await safeJsonFetch(v3, "One Call v3.0");
  } catch {
    const v25 = `${OWM_BASE}/data/2.5/onecall?lat=${lat}&lon=${lon}&units=${units}&exclude=minutely,alerts&appid=${OWM_KEY}`;
    return await safeJsonFetch(v25, "One Call v2.5");
  }
}

export async function fetchCurrentWeather({ lat, lon, units = "metric" }) {
  const url = `${OWM_BASE}/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${OWM_KEY}`;
  return safeJsonFetch(url, "Current weather");
}

export async function fetchByCity(city, units = "metric") {
  const c = await fetchCoords(city);
  const data = await fetchOneCall({ lat: c.lat, lon: c.lon, units });
  return { coords: { lat: c.lat, lon: c.lon }, label: c.label, data };
}

// ---------- NEW: rain today analysis ----------
export function analyzeRainToday(onecall) {
  if (!onecall?.hourly?.length) return { willRain: false, chance: 0, when: "", amount: 0 };

  const offset = onecall.timezone_offset || 0; // seconds
  const nowUtc = Math.floor(Date.now() / 1000);
  const nowLocal = nowUtc + offset;
  const d = new Date(nowLocal * 1000);

  // start of today's local day -> back to UTC secs
  const startLocal = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
  const startUtc = startLocal - offset;
  const endUtc = startUtc + 86400;

  let maxPop = 0;
  let firstRainHour = null;
  let firstAmount = 0;

  for (const h of onecall.hourly) {
    if (h.dt < startUtc || h.dt >= endUtc) continue;
    const code = h.weather?.[0]?.id || 0;
    const amount = (h.rain?.["1h"] ?? 0) + (h.snow?.["1h"] ?? 0);
    const looksRainy = code >= 200 && code < 600; // thunder (2xx), drizzle (3xx), rain (5xx)
    const pop = h.pop ?? 0;

    if (pop > maxPop) maxPop = pop;

    if (!firstRainHour && (looksRainy || amount > 0 || pop >= 0.3)) {
      firstRainHour = h.dt;
      firstAmount = amount;
    }
  }

  const willRain = !!firstRainHour || maxPop >= 0.5;

  let whenText = "";
  if (firstRainHour) {
    const t = new Date((firstRainHour + offset) * 1000);
    const hh = t.getUTCHours().toString().padStart(2, "0");
    const mm = t.getUTCMinutes().toString().padStart(2, "0");
    whenText = `${hh}:${mm}`; // local time of the location
  }

  return {
    willRain,
    chance: Math.round(maxPop * 100),
    when: whenText,
    amount: firstAmount,
  };
}
