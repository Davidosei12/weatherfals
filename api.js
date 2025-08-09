// src/api.js

const OWM_KEY = import.meta.env.VITE_OWM_API_KEY;
const OWM_BASE = "https://api.openweathermap.org";

function normalizeQuery(q) {
  return (q || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureCountry(q, country = "GH") {
  // If query already includes a comma (likely has country/state), keep it
  if (/,/.test(q)) return q;
  return `${q}, ${country}`;
}

// --- Shared fetch helper with nicer errors ---
async function safeJsonFetch(url, label = "Request") {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `${label} failed (${res.status})`;
    try {
      const t = await res.text();
      msg += `: ${t}`;
    } catch {}
    // Common OWM issues → friendlier messages
    if (res.status === 401) {
      throw new Error(
        "OpenWeather API key rejected (401). Check VITE_OWM_API_KEY in your env and redeploy."
      );
    }
    if (res.status === 404) {
      throw new Error("City not found. Try adding a country code, e.g. “Koforidua, GH”.");
    }
    throw new Error(msg);
  }
  return res.json();
}

// --- Geocoding: robust city → lat/lon ---
export async function fetchCoords(rawQuery) {
  const q0 = normalizeQuery(rawQuery);
  if (!q0) throw new Error("Please enter a city");

  const tries = [
    q0,                     // e.g., "koforidua"
    ensureCountry(q0, "GH") // e.g., "koforidua, GH" as a default country hint
  ];

  for (const q of tries) {
    const url = `${OWM_BASE}/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=5&appid=${OWM_KEY}`;
    const arr = await safeJsonFetch(url, "Geocoding");
    if (Array.isArray(arr) && arr.length > 0) {
      const top = arr[0];
      return {
        lat: top.lat,
        lon: top.lon,
        label: [top.name, top.state, top.country].filter(Boolean).join(", ")
      };
    }
  }

  throw new Error('City not found. Try adding the country (e.g., "Koforidua, GH").');
}

// --- Weather: One Call (tries v3 then falls back to v2.5) ---
export async function fetchOneCall({ lat, lon, units = "metric" }) {
  if (!lat || !lon) throw new Error("Missing coordinates");

  // Try One Call v3.0 (may require a paid plan)
  const v3 = `${OWM_BASE}/data/3.0/onecall?lat=${lat}&lon=${lon}&units=${units}&exclude=minutely,alerts&appid=${OWM_KEY}`;
  try {
    const data = await safeJsonFetch(v3, "One Call v3.0");
    // Normalize shape a bit to what the app expects
    return data;
  } catch (e) {
    // If 401/403/404 etc., try v2.5 fallback
    const v25 = `${OWM_BASE}/data/2.5/onecall?lat=${lat}&lon=${lon}&units=${units}&exclude=minutely,alerts&appid=${OWM_KEY}`;
    const data = await safeJsonFetch(v25, "One Call v2.5");
    return data;
  }
}

// --- Current weather only (if you ever need it separately) ---
export async function fetchCurrentWeather({ lat, lon, units = "metric" }) {
  const url = `${OWM_BASE}/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${OWM_KEY}`;
  return safeJsonFetch(url, "Current weather");
}

// --- Convenience: search by city then fetch weather ---
export async function fetchByCity(city, units = "metric") {
  const c = await fetchCoords(city);
  const data = await fetchOneCall({ lat: c.lat, lon: c.lon, units });
  return { coords: { lat: c.lat, lon: c.lon }, label: c.label, data };
}
