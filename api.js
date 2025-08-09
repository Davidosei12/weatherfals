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
// Stronger "rain today" analyzer:
// 1) Use daily[0].pop / daily[0].rain first (covers “today” cleanly).
// 2) Use hourly to estimate the first rainy hour (fallback-safe).

export function analyzeRainToday(onecall) {
  if (!onecall) return { willRain: false, chance: 0, when: "", amount: 0 };

  const daily0 = onecall.daily?.[0] || null;
  let chance = 0;
  let amount = 0;

  if (daily0) {
    // daily.pop is 0..1 probability for the *day*
    chance = Math.round(((daily0.pop ?? 0) * 100));
    // daily.rain may be total mm for the day
    amount = Number.isFinite(daily0.rain) ? daily0.rain : 0;
  }

  // Try to find the first rainy hour for "when"
  let when = "";
  const offset = onecall.timezone_offset || 0; // seconds
  const nowUtc = Math.floor(Date.now() / 1000);
  const endUtc = nowUtc + 24 * 3600; // next 24h window

  if (onecall.hourly?.length) {
    for (const h of onecall.hourly) {
      if (h.dt < nowUtc || h.dt > endUtc) continue;
      const pop = h.pop ?? 0;
      const code = h.weather?.[0]?.id || 0;
      const hrAmount = (h.rain?.["1h"] ?? 0) + (h.snow?.["1h"] ?? 0);
      const rainyCode = code >= 200 && code < 600;

      // pick a modest threshold to indicate likely rain in an hour
      if (rainyCode || hrAmount > 0 || pop >= 0.3) {
        const t = new Date((h.dt + offset) * 1000);
        const hh = t.getUTCHours().toString().padStart(2, "0");
        const mm = t.getUTCMinutes().toString().padStart(2, "0");
        when = `${hh}:${mm}`;
        // If we had no daily amount, use the first hour amount as a hint
        if (!amount && hrAmount) amount = hrAmount;
        break;
      }
    }

    // If daily0 missing, backfill chance from the max hourly pop in 24h
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
