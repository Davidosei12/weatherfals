// Home.jsx
import { useState, useEffect } from "react";
import {
  ensureAnon, upsertUserProfile, trackVisit, trackSearch,
  watchSettings, watchAds
} from "./lib/firebaseStore";
import { fetchCoords } from "./api"; // your existing coords fetcher

export default function Home() {
  const [coords, setCoords] = useState(null);
  const [place, setPlace] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [settings, setSettings] = useState({ siteName: "Weather", logoUrl: "" });
  const [ads, setAds] = useState([]);

  // 1️⃣ Anonymous sign-in + visit tracking + user profile
  useEffect(() => {
    ensureAnon().then(trackVisit);
    try {
      const raw = localStorage.getItem("weather_profile");
      if (raw) {
        const p = JSON.parse(raw);
        upsertUserProfile({ name: p.name || "Guest", photo: p.photo || "" });
        if (p.name) setShowWelcome(true);
      }
    } catch {}
  }, []);

  // 2️⃣ Live site settings + ads
  useEffect(() => {
    const unS = watchSettings(setSettings);
    const unA = watchAds(setAds);
    return () => { unS(); unA(); };
  }, []);

  // 3️⃣ Search handler
  async function loadByCity(city) {
    try {
      setErr("");
      setLoading(true);
      const c = await fetchCoords(city);
      setCoords({ lat: c.lat, lon: c.lon });
      setPlace(c.label);
      await trackSearch(city);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  // 4️⃣ JSX render
  return (
    <div>
      {showWelcome && <div className="welcome">Welcome, {settings.siteName}!</div>}
      {/* your search input calling loadByCity */}
      {/* your weather display */}
      {/* your ads display */}
    </div>
  );
}
