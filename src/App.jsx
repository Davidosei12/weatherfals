import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import SearchBar from "./components/SearchBar.jsx";
import UnitToggle from "./components/UnitToggle.jsx";
import WeatherCard from "./components/WeatherCard.jsx";
import Forecast from "./components/Forecast.jsx";
import Profile from "./components/Profile.jsx";
import WelcomeToast from "./components/WelcomeToast.jsx";
import AdminLogin from "./admin/AdminLogin.jsx";
import AdminDashboard from "./admin/AdminDashboard.jsx";
import { fetchCoords, fetchOneCall } from "./api.js";
import {
  ensureAnon, upsertUserProfile, trackVisit, trackSearch,
  watchSettings, watchAds
} from "./lib/firebaseStore";

import {
  getOrCreateVisitor, upsertUser, getSettings, listAds
} from "./lib/store";

function Home() {
  const [units, setUnits] = useState("metric");
  const [place, setPlace] = useState("Accra, GH");
  const [coords, setCoords] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [profile, setProfile] = useState({ name: "", photo: "" });
  const [showWelcome, setShowWelcome] = useState(false);
  const visitorId = useMemo(() => getOrCreateVisitor(), []);
  const settings = getSettings();
  const ads = listAds().filter(a => a.active);

  // dynamic bg
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

  // profile load + greeting + sync to users
  useEffect(() => {
    try {
      const raw = localStorage.getItem("weather_profile");
      if (raw) {
        const p = JSON.parse(raw);
        setProfile({ name: p.name || "", photo: p.photo || "" });
        if (p.name) setShowWelcome(true);
        upsertUser({ id: visitorId, name: p.name || "Guest", photo: p.photo || "", lastSeen: Date.now() });
      }
    } catch {}
  }, [visitorId]);

  // search by city
  async function loadByCity(city) {
    try { setErr(""); setLoading(true);
      const c = await fetchCoords(city);
      setCoords({ lat: c.lat, lon: c.lon });
      setPlace(c.label);
      trackSearch(visitorId, city);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }
  // weather fetch
  async function loadWeather(c) {
    try { setErr(""); setLoading(true);
      const res = await fetchOneCall({ ...c, units });
      setData(res);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  // geolocation first hit
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
          <img alt="Weatherfals logo" src="/weatherfals-logo.png" style={{ height: 32, borderRadius: 6 }} />
          <h1 className="logo">{settings.siteName || "Weatherfals"}</h1>
          {profile?.name && <div className="hello muted">Hi, {profile.name}</div>}
        </div>
        <div className="row" style={{ gap: 12 }}>
          <UnitToggle units={units} setUnits={setUnits} />
          <Profile profile={profile} setProfile={(p)=>{ setProfile(p); upsertUser({ id: visitorId, name:p.name||"Guest", photo:p.photo||"", lastSeen:Date.now() }); }} />
        </div>
      </header>

      <main className="container">
        <SearchBar onSearch={loadByCity} />
        {loading && <div className="info">Loading…</div>}
        {err && <div className="error">{err}</div>}
        {data && (
          <>
            <WeatherCard place={place} current={data.current} units={units} />
            {/* Ad slot */}
            {!!ads.length && (
              <div className="grid" style={{ marginTop:12 }}>
                {ads.map(a=>(
                  <a key={a.id} className="card mini" href={a.linkUrl} target="_blank" rel="noreferrer">
                    <div style={{ fontWeight:700 }}>{a.title}</div>
                    {a.imageUrl && <img alt="" src={a.imageUrl} style={{ width:"100%", borderRadius:8, marginTop:6 }}/>}
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

export default function App(){
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home/>} />
        <Route path="/adminverifys/" element={<AdminLogin/>} />
        <Route path="/admin/dashboard" element={<AdminDashboard/>} />
      </Routes>
    </BrowserRouter>
  );
}
