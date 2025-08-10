// src/admin/AdminDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdPopup from "../components/AdPopup.jsx";

import {
  // auth/guard
  watchAuth, adminLogout, isCurrentUserAdmin,
  // analytics
  watchAnalytics,
  // users
  watchUsers, setUserBanned, removeUser, promoteToAdmin,
  // settings
  watchSettings, saveSettings,
  // ads core
  watchAds, saveAd, removeAdById,
  // uploads
  uploadAdAsset, deleteAdAsset,
} from "../lib/firebaseStore";

export default function AdminDashboard() {
  const nav = useNavigate();

  const [tab, setTab] = useState("analytics");

  // analytics
  const [visits, setVisits] = useState([]);
  const [searches, setSearches] = useState([]);

  // users
  const [users, setUsers] = useState([]);

  // settings
  const [settings, setSettingsState] = useState({ siteName: "Weatherfals", logoUrl: "" });

  // ads
  const [ads, setAds] = useState([]);
  const [adForm, setAdForm] = useState({
    id: null,
    title: "",
    linkUrl: "",
    active: true,
    advertiser: "sponsor",
    mediaUrl: "",
    mediaPath: "",
    mediaType: "image", // "image" | "video"
  });
  const [uploading, setUploading] = useState(false);

  // ---- guard + live listeners ----
  useEffect(() => {
    const unsubAuth = watchAuth(async (u) => {
      if (!u || !(await isCurrentUserAdmin())) nav("/adminverifys/");
    });
    const unA = watchAnalytics(({ type, docs }) => {
      if (type === "visits") setVisits(docs);
      if (type === "searches") setSearches(docs);
    });
    const unU = watchUsers(setUsers);
    const unS = watchSettings(setSettingsState);
    const unAds = watchAds(setAds);
    return () => { unsubAuth(); unA(); unU(); unS(); unAds(); };
  }, [nav]);

  const totals = useMemo(() => ({
    totalVisits: visits.length,
    uniqueUsers: new Set(visits.map(v => v.uid)).size,
    searches: searches.length,
    latestVisit: visits[0]?.at?.toDate?.()?.toLocaleString?.() ?? "—"
  }), [visits, searches]);

  // ---- settings ----
  async function onSaveSettings() {
    await saveSettings(settings);
    alert("Settings saved");
  }

  // ---- ads helpers ----
  function missingFields() {
    return ["title", "linkUrl", "mediaUrl"].filter(k => !String(adForm[k] || "").trim());
  }

  async function onUploadFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const up = await uploadAdAsset(f, adForm.advertiser || "sponsor");
      setAdForm(prev => ({
        ...prev,
        mediaUrl: up.url,
        mediaPath: up.path,
        mediaType: up.mediaType
      }));
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed. Check Storage rules and that you’re signed in as admin.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  // In the Ads tab UI:
<button className="btn" onClick={() => setPreview(p => !p)}>
  {preview ? "Close Preview" : "Preview Popup"}
</button>

{preview && (
  <AdPopup
    ads={ads.filter(a => a.active)}
    intervalMs={999999}      // disable auto-loop during preview
    initialDelayMs={0}
    forceShow={true}         // show immediately
  />
)}

  async function onSaveAd() {
    const miss = missingFields();
    if (miss.length) {
      alert("Please fill " + miss.join(", ") + ".");
      return;
    }
    try {
      await saveAd(adForm);
      setAdForm({
        id: null,
        title: "",
        linkUrl: "",
        active: true,
        advertiser: "sponsor",
        mediaUrl: "",
        mediaPath: "",
        mediaType: "image",
      });
      alert("Ad saved");
    } catch (e) {
      console.error("Save ad failed:", e);
      alert("Could not save ad. Check Firestore rules and console.");
    }
  }

  function onEditAd(a) {
    setAdForm({
      id: a.id,
      title: a.title || "",
      linkUrl: a.linkUrl || "",
      active: !!a.active,
      advertiser: a.advertiser || "sponsor",
      mediaUrl: a.mediaUrl || "",
      mediaPath: a.mediaPath || "",
      mediaType: a.mediaType || "image",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onDeleteAd(a) {
    if (!confirm("Delete this ad?")) return;
    try {
      if (a.mediaPath) {
        try { await deleteAdAsset(a.mediaPath); } catch (e) { console.warn("Storage delete skipped:", e); }
      }
      await removeAdById(a.id);
    } catch (e) {
      console.error(e);
      alert("Delete failed. Check Storage/Firestore permissions.");
    }
  }

  return (
    <div className="admin container" style={{ paddingTop: 24 }}>
      <div className="row space-between">
        <h2 style={{ margin: 0 }}>Welcome, Admin 👋</h2>
        <button className="btn" onClick={adminLogout}>Logout</button>
      </div>

      <div className="tabs">
        {["analytics","users","settings","ads"].map(k=>(
          <button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>
            {k.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ANALYTICS */}
      {tab==="analytics" && (
        <div className="grid">
          <div className="card">
            <div className="section-title">Totals</div>
            <div className="row wrap" style={{ gap:10 }}>
              <div className="metric">Visits:&nbsp;<b>{totals.totalVisits}</b></div>
              <div className="metric good">Unique:&nbsp;<b>{totals.uniqueUsers}</b></div>
              <div className="metric">Searches:&nbsp;<b>{totals.searches}</b></div>
              <div className="metric warn">Latest:&nbsp;<b>{totals.latestVisit}</b></div>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Latest Visits</div>
            <ul style={{ margin:0, paddingLeft:18 }}>
              {visits.slice(0,12).map(v=>(
                <li key={v.id}>{v.uid?.slice(0,6)}… — {v.at?.toDate?.()?.toLocaleString?.() ?? "—"}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="section-title">Latest Searches</div>
            <ul style={{ margin:0, paddingLeft:18 }}>
              {searches.slice(0,12).map(s=>(
                <li key={s.id}><b>{s.q}</b> — {s.uid?.slice(0,6)}… — {s.at?.toDate?.()?.toLocaleString?.() ?? "—"}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* USERS */}
      {tab==="users" && (
        <div className="card">
          <div className="section-title">User Management</div>
          <div className="table">
            <div className="thead">
              <div>UID</div><div>Name</div><div>Status</div><div>Actions</div>
            </div>
            {users.map(u=>(
              <div key={u.id} className="trow" style={{ gridTemplateColumns: "1.1fr 1fr 1fr 1.6fr" }}>
                <div>{u.id.slice(0,8)}…</div>
                <div>{u.name || "Guest"}</div>
                <div>
                  {u.banned
                    ? <span className="badge banned">BANNED</span>
                    : <span className="badge active">ACTIVE</span>}
                  {u.isAdmin && <span className="badge admin" style={{ marginLeft:8 }}>ADMIN</span>}
                </div>
                <div className="row wrap" style={{ gap:8 }}>
                  <button className="btn warn" onClick={()=> setUserBanned(u.id, !u.banned)}>
                    {u.banned ? "Unban" : "Ban"}
                  </button>
                  <button className="btn danger" onClick={()=> removeUser(u.id)}>Remove</button>
                  {!u.isAdmin && (
                    <button className="btn primary" onClick={()=> promoteToAdmin(u.id)}>Make Admin</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS */}
      {tab==="settings" && (
        <div className="card">
          <div className="section-title">Website Settings</div>
          <div className="row wrap" style={{ gap:12 }}>
            <div style={{ minWidth: 280 }}>
              <label className="label">Site Name</label>
              <input value={settings.siteName || ""} onChange={e=>setSettingsState(s=>({ ...s, siteName: e.target.value }))}/>
            </div>
            <div style={{ minWidth: 280 }}>
              <label className="label">Logo URL</label>
              <input value={settings.logoUrl || ""} onChange={e=>setSettingsState(s=>({ ...s, logoUrl: e.target.value }))}/>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={onSaveSettings}>Save Settings</button>
          </div>
        </div>
      )}

      {/* ADS */}
      {tab==="ads" && (
        <div className="grid">
          {/* Form */}
          <div className="card">
            <div className="section-title">New / Edit Ad</div>

            <div className="row wrap" style={{ gap:10 }}>
              <input
                placeholder="Title"
                value={adForm.title}
                onChange={e=>setAdForm(f=>({ ...f, title:e.target.value }))}
              />
              <input
                placeholder="Link URL (https://...)"
                value={adForm.linkUrl}
                onChange={e=>setAdForm(f=>({ ...f, linkUrl:e.target.value }))}
              />
              <input
                placeholder="Advertiser (folder)"
                value={adForm.advertiser}
                onChange={e=>setAdForm(f=>({ ...f, advertiser:e.target.value }))}
                style={{ maxWidth:180 }}
              />
              <label style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input
                  type="checkbox"
                  checked={!!adForm.active}
                  onChange={e=>setAdForm(f=>({ ...f, active:e.target.checked }))}
                />
                Active
              </label>
            </div>

            {/* Upload OR paste URL */}
            <div className="row wrap" style={{ gap:12, marginTop:10 }}>
              <input type="file" accept="image/*,video/*" onChange={onUploadFile} />
              <input
                placeholder="Or paste media URL (image/video)"
                value={adForm.mediaUrl}
                onChange={e=>setAdForm(f=>({ ...f, mediaUrl:e.target.value }))}
                style={{ minWidth: 320 }}
              />
              {uploading && <div className="muted">Uploading…</div>}
            </div>

            {/* Preview */}
            {adForm.mediaUrl && (
              <div style={{ marginTop:10 }}>
                {(adForm.mediaType === "video" || /\.mp4|\.webm|\.ogg$/i.test(adForm.mediaUrl))
                  ? <video src={adForm.mediaUrl} controls style={{ width:360, borderRadius:12 }} />
                  : <img src={adForm.mediaUrl} alt="preview" style={{ width:360, borderRadius:12 }} />}
              </div>
            )}

            {/* Missing fields hint */}
            <div className="muted" style={{ marginTop:10, fontSize:12 }}>
              Missing: {missingFields().join(", ") || "none ✅"}
            </div>

            <div className="row space-between" style={{ marginTop:12 }}>
              <button
                className="btn"
                onClick={()=> setAdForm({
                  id:null, title:"", linkUrl:"", active:true, advertiser:"sponsor",
                  mediaUrl:"", mediaPath:"", mediaType:"image"
                })}
              >
                Clear
              </button>
              <button className="btn primary" onClick={onSaveAd}>
                {adForm.id ? "Update Ad" : "Add Ad"}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="card">
            <div className="section-title">Ads</div>
            <div className="grid">
              {ads.map(a=>(
                <div key={a.id} className="card mini">
                  <div style={{ fontWeight:700 }}>{a.title}</div>
                  <div className="muted" style={{ fontSize:12, marginTop:4 }}>
                    {a.advertiser || "sponsor"} • {a.active ? "Active" : "Inactive"}
                  </div>
                  {a.mediaUrl && (
                    a.mediaType === "video" || /\.mp4|\.webm|\.ogg$/i.test(a.mediaUrl)
                      ? <video src={a.mediaUrl} controls style={{ width:"100%", borderRadius:8, marginTop:6 }} />
                      : <img alt="" src={a.mediaUrl} style={{ width:"100%", borderRadius:8, marginTop:6 }} />
                  )}
                  <div className="muted" style={{ fontSize:12, marginTop:6, wordBreak:"break-all" }}>
                    {a.linkUrl}
                  </div>
                  <div className="row wrap" style={{ marginTop:8, gap:8 }}>
                    <button className="btn" onClick={()=>onEditAd(a)}>Edit</button>
                    <button className="btn danger" onClick={()=>onDeleteAd(a)}>Delete</button>
                  </div>
                </div>
              ))}
              {!ads.length && <div className="muted">No ads yet</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
