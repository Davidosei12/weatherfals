// src/App.jsx
import { useEffect, useState, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import dayjs from "dayjs";

import SearchBar from "./components/SearchBar.jsx";
import UnitToggle from "./components/UnitToggle.jsx";
import WeatherCard from "./components/WeatherCard.jsx";
import Forecast from "./components/Forecast.jsx";
import Profile from "./components/Profile.jsx";
import WelcomeToast from "./components/WelcomeToast.jsx";

import { fetchCoords, fetchOneCall, analyzeRainToday } from "./api.js";
import {
  ensureAnon, upsertUserProfile, trackVisit, trackSearch,
  watchSettings, watchAds
} from "./lib/firebaseStore";

// Lazy-load admin pages so they don't affect the home page on errors
const AdminLogin = lazy(() => import("./admin/AdminLogin.jsx"));
const AdminDashboard = lazy(() => import("./admin/AdminDashboard.jsx"));

/* -------------------------
   Home page (main weather)
--------------------------*/
function Home() {
  const [units, setUnits] = useState("metric");
  const [place, setPlace] = useState("Accra, GH");
  const [coords, setCoords] = useState(null);
  const [data, setData] = useState(null);
  const [rainInfo, setRainInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [profile, setProfile] = useState({ name: "", photo: "" });
  const [showWelcome, setShowWelcome] = useState(false);

  const [settings, setSettings] = useState({ siteName: "Weatherfals", logoUrl: "" });
  const [ads, setAds] = useState([]);

  // sign in anon, load profile from localStorage
  useEffect(() => {
    ensureAnon().then(trackVisit);
    try {
      const raw = localStorage.getItem("weather_profile");
      if (raw) {
        const p = JSON.parse(raw);
        setProfile({ name: p.name || "", photo: p.photo || "" });
        if (p.name) setShowWelcome(true);
        upsertUserProfile({ name: p.name || "Guest", photo: p.photo || "" });
      }
    } catch {}
  }, []);

  // watch site settings & ads from Firestore
  useEffect(() => {
    const unS = watchSettings(setSettings);
    const unA = watchAds(setAds);
    return () => { unS(); unA(); };
  }, []);

  // dynamic background based on weather
  function getBgUrl(code, desc = "") {
    const text = (desc || "").toLowerCase();
    const u = (q) => `https://images.unsplash.com/${q}?auto=format&fit=crop&w=1920&q=80`;
    if (code === 800 || text.includes("clear")) return u("photo-1502082553048-f009c37129b9");
    if ((code >= 801 && code <= 804) || text.includes("cloud")) return u("photo-1500530855697-b586d89ba3ee");
    if ((code >= 200 && code < 300) || text.includes("thunder")) return u("photo-1504384308090-c894fdcc538d");
    if ((code >= 300 && code < 600) || text.includes("rain") || text.includes("drizzle")) return u("photo-1469474968028-56623f02e42e");
    if ((code >= 600 && code < 700) || text.includes("snow")) return u("photo-1519681393784-d120267933ba");
    if ((code >= 700 && code < 800) || text.includes("fog") || text.includes("mist") || text.includes("haze")) return u("photo-1499346030926-9a72daac6c63");
    return u("photo-1506744038136-46273834b3fb");
  }
  useEffect(() => {
    const code = data?.current?.weather?.[0]?.id ?? null;
    const desc = data?.current?.weather?.[0]?.description ?? "";
    const url = getBgUrl(code, desc);
    document.documentElement.style.setProperty("--bg-url", `url("${url}")`);
  }, [data]);

  // search
  async function loadByCity(city) {
    try {
      setErr(""); setLoading(true);
      const c = await fetchCoords((city || "").trim());
      setCoords({ lat: c.lat, lon: c.lon });
      setPlace(c.label);
      await trackSearch(city);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  // weather load
  async function loadWeather(c) {
    try {
      setErr(""); setLoading(true);
      const res = await fetchOneCall({ ...c, units });
      setData(res);
      setRainInfo(analyzeRainToday(res));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  // first location
  useEffect(() => {
    const done = (lat, lon) => { setCoords({ lat, lon }); setPlace("Your location"); };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => done(p.coords.latitude, p.coords.longitude),
        () => loadByCity("Accra")
      );
    } else { loadByCity("Accra"); }
  }, []);

  useEffect(() => { if (coords) loadWeather(coords); }, [coords, units]);

  return (
    <div className="page">
      <WelcomeToast name={profile.name} show={showWelcome && !!profile.name} onClose={()=>setShowWelcome(false)} />

      <header className="header row space-between">
        <div className="row" style={{ gap: 12 }}>
          {settings.logoUrl && <img alt="logo" src={settings.logoUrl} style={{ height:32, borderRadius:6 }} />}
          <h1 className="logo">{settings.siteName || "Weatherfals"}</h1>
          {profile?.name && <div className="hello muted">Hi, {profile.name}</div>}
        </div>
        <div className="row" style={{ gap: 12 }}>
          <UnitToggle units={units} setUnits={setUnits} />
          <Profile profile={profile} setProfile={(p)=>{ setProfile(p); upsertUserProfile({ name:p.name||"Guest", photo:p.photo||"" }); }} />
        </div>
      </header>

      <main className="container">
        <SearchBar onSearch={loadByCity} />
        {loading && <div className="info">Loading…</div>}
        {err && <div className="error">{err}</div>}

        {data && (
          <>
            <WeatherCard place={place} current={data.current} units={units} />

            {/* Rain today banner */}
            {rainInfo && (
              <div className="card" style={{ marginTop: 12 }}>
                {rainInfo.willRain ? (
                  <div>
                    🌧️ <b>Rain today</b>
                    {rainInfo.when && <> around <b>{rainInfo.when}</b></>}
                    {` — chance ~${rainInfo.chance}%`}
                    {rainInfo.amount > 0 && <> (≈ {rainInfo.amount.toFixed(1)} mm)</>}
                  </div>
                ) : (
                  <div>☀️ <b>No rain expected today</b> (chance ≤ {Math.max(5, rainInfo.chance)}%).</div>
                )}
              </div>
            )}

            {/* Ads */}
            {!!ads.length && (
              <div className="grid" style={{ marginTop:12 }}>
                {ads.map(a=>(
                  <a key={a.id} className="card mini" href={a.linkUrl} target="_blank" rel="noreferrer">
                    <div style={{ fontWeight:700 }}>{a.title}</div>
                    {a.mediaUrl
                      ? (a.mediaType === "video"
                          ? <video src={a.mediaUrl} controls style={{ width:"100%", borderRadius:8, marginTop:6 }} />
                          : <img alt={a.title} src={a.mediaUrl} style={{ width:"100%", borderRadius:8, marginTop:6 }} />)
                      : null}
                  </a>
                ))}
              </div>
            )}

            <Forecast daily={data.daily} units={units} />

            <div className="card" style={{ marginTop: 12 }}>
              <div className="row wrap">
                <div>Pressure: {data.current.pressure ?? "—"} hPa</div>
                <div>Clouds: {data.current.clouds ?? "—"}%</div>
                <div>Visibility: {data.current.visibility ?? "—"} m</div>
                <div>Updated: {dayjs.unix(data.current.dt).format("h:mm A")}</div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* -------------------------
   App router with admin
--------------------------*/
export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="info" style={{ padding:16 }}>Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/adminverifys/" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
