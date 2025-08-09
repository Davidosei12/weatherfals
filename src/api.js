// src/api.js

// --- Config ---
const OWM_KEY = import.meta.env.VITE_OWM_API_KEY;
const OWM_BASE = "https://api.openweathermap.org";

// --- Geocoding (free, no key, reliable) ---
export async function fetchCoords(city) {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?` +
    `name=${encodeURIComponent(city)}&count=1&language=en&format=json`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Location lookup failed (${r.status})`);

  const data = await r.json();
  const hit = data?.results?.[0];
  if (!hit) throw new Error("City not found");

  const { latitude: lat, longitude: lon, name, country_code } = hit;
  return { lat, lon, label: `${name}, ${country_code}` };
}

// --- Weather (OWM free plan): current + 5-day forecast shaped like OneCall ---
export async function fetchOneCall({ lat, lon, units = "metric" }) {
  if (!OWM_KEY) {
    throw new Error("Missing OpenWeatherMap key (VITE_OWM_API_KEY)");
  }

  // 1) Current weather
  const curURL = `${OWM_BASE}/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${OWM_KEY}`;
  // 2) 5-day / 3-hour forecast
  const fcURL = `${OWM_BASE}/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${OWM_KEY}`;

  const [curRes, fcRes] = await Promise.all([fetch(curURL), fetch(fcURL)]);

  // Helpful error messages
  if (!curRes.ok) {
    const text = await curRes.text();
    throw new Error(`Current weather failed (${curRes.status}): ${text || "Unknown error"}`);
  }
  if (!fcRes.ok) {
    const text = await fcRes.text();
    // If you were calling /data/3.0/onecall before, a 401 here confirms plan limits
    throw new Error(`Forecast failed (${fcRes.status}): ${text || "Unknown error"}`);
  }

  const current = await curRes.json();
  const forecast = await fcRes.json();

  // --- Shape "current" like OneCall.current ---
  const shapedCurrent = {
    dt: current.dt,
    temp: current.main?.temp,
    feels_like: current.main?.feels_like,
    humidity: current.main?.humidity,
    pressure: current.main?.pressure,
    wind_speed: current.wind?.speed,
    clouds: current.clouds?.all ?? 0,
    visibility: current.visibility ?? null,
    uvi: null, // Not available on free 2.5 endpoints
    weather: current.weather || []
  };

  // --- Aggregate 3-hour steps into daily max/min for ~5 days ---
  const byDay = {};
  for (const item of forecast.list || []) {
    const d = new Date(item.dt * 1000);
    const key = ymdLocal(d); // group by LOCAL day so it matches user expectation
    if (!byDay[key]) {
      byDay[key] = {
        dt: item.dt,
        max: Number.NEGATIVE_INFINITY,
        min: Number.POSITIVE_INFINITY,
        weatherCode: item.weather?.[0] || null
      };
    }
    byDay[key].dt = Math.max(byDay[key].dt, item.dt);
    byDay[key].max = Math.max(byDay[key].max, item.main?.temp_max ?? Number.NEGATIVE_INFINITY);
    byDay[key].min = Math.min(byDay[key].min, item.main?.temp_min ?? Number.POSITIVE_INFINITY);
    // Keep the most recent weather descriptor seen that day
    if (item.weather?.[0]) byDay[key].weatherCode = item.weather[0];
  }

  // Convert to OneCall.daily-like array (first element = today/next day slot)
  const daily = Object.values(byDay)
    .sort((a, b) => a.dt - b.dt)
    .slice(0, 7) // UI can show up to 7; free data ~5 days available
    .map(d => ({
      dt: d.dt,
      temp: { max: d.max, min: d.min },
      weather: d.weatherCode ? [d.weatherCode] : []
    }));

  return { current: shapedCurrent, daily };
}

// --- Helpers ---
function ymdLocal(d) {
  // Format YYYY-MM-DD using LOCAL time (not UTC) to group daily values intuitively
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
