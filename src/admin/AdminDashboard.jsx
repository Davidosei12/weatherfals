// src/admin/AdminDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { auth, db, storage } from "../firebase";
import {
  collection, doc, getDoc, onSnapshot, setDoc, updateDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy
} from "firebase/firestore";
import {
  ref, uploadBytesResumable, getDownloadURL
} from "firebase/storage";
import AdPopup from "../components/AdPopup.jsx";

// -----------------------------
// Helpers
// -----------------------------
function formatDate(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleString();
}

function isVideoUrl(url = "") {
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(url);
}

// -----------------------------
// Admin guard hook
// -----------------------------
function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(null); // null = loading
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          setIsAdmin(false);
          setErr("You are not signed in. Go to /adminverifys/ to sign in.");
          return;
        }
        const snap = await getDoc(doc(db, "admins", uid));
        if (!cancelled) setIsAdmin(snap.exists());
        if (!snap.exists() && !cancelled) {
          setErr("Admins only. Your UID is not in /admins.");
        }
      } catch (e) {
        if (!cancelled) {
          setIsAdmin(false);
          setErr(e?.message || "Failed to verify admin.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { isAdmin, err };
}

// -----------------------------
// Main component
// -----------------------------
export default function AdminDashboard() {
  const { isAdmin, err: adminErr } = useIsAdmin();

  // Tabs: ads / settings / users
  const [tab, setTab] = useState("ads");

  // ---------- Ads state ----------
  const [ads, setAds] = useState([]);
  const [adForm, setAdForm] = useState({
    id: null,
    title: "",
    linkUrl: "",
    active: true,
    advertiser: "sponsor",
    mediaUrl: "",     // uploaded result URL
    mediaPath: "",    // storage path (for deletes)
    mediaType: "image",
    externalUrl: ""   // optional external media
  });
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [preview, setPreview] = useState(false); // Preview Popup toggle

  // ---------- Settings state ----------
  const [settings, setSettings] = useState({
    siteName: "Weatherfals",
    logoUrl: "/weatherfals-logo.png",
    adPopupEnabled: true,
    adPopupIntervalSeconds: 51,
    adPopupInitialDelaySeconds: 5,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ---------- Users state (read-only) ----------
  const [users, setUsers] = useState([]);

  // Attach listeners only after we know user is admin
  useEffect(() => {
    if (isAdmin !== true) return;
    const unsubs = [];

    // Ads (ordered by createdAt desc if present)
    try {
      const qAds = query(collection(db, "ads"), orderBy("createdAt", "desc"));
      const unA = onSnapshot(qAds, {
        next: (snap) => {
          const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setAds(arr);
        },
        error: (e) => console.warn("ads onSnapshot denied:", e.code, e.message)
      });
      unsubs.push(unA);
    } catch (e) { console.warn("ads watch failed:", e?.message || e); }

    // Settings (single doc: settings/site)
    try {
      const ref = doc(db, "settings", "site");
      const unS = onSnapshot(ref, {
        next: (snap) => {
          if (snap.exists()) setSettings(prev => ({ ...prev, ...snap.data() }));
          setSettingsLoaded(true);
        },
        error: (e) => { console.warn("settings watch denied:", e.code, e.message); setSettingsLoaded(true); }
      });
      unsubs.push(unS);
    } catch (e) { console.warn("settings watch failed:", e?.message || e); setSettingsLoaded(true); }

    // Users (optional; read-only)
    try {
      const qUsers = query(collection(db, "users"), orderBy("updatedAt", "desc"));
      const unU = onSnapshot(qUsers, {
        next: (snap) => {
          const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setUsers(arr);
        },
        error: (e) => console.warn("users watch denied:", e.code, e.message)
      });
      unsubs.push(unU);
    } catch (e) { console.warn("users watch failed:", e?.message || e); }

    return () => unsubs.forEach(u => u && u());
  }, [isAdmin]);

  // ---------- Ads form helpers ----------
  const missingFields = useMemo(() => {
    const need = [];
    if (!adForm.title.trim()) need.push("title");
    if (!adForm.linkUrl.trim()) need.push("linkUrl");
    const hasMedia = !!adForm.mediaUrl || !!adForm.externalUrl;
    if (!hasMedia) need.push("media (upload or paste URL)");
    return need;
  }, [adForm]);

  const canSaveAd = !uploading && missingFields.length === 0;

  async function handleUploadFile(file) {
    setUploading(true); setUploadPct(0);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const kind = file.type.startsWith("video/") || isVideoUrl(file.name) ? "video" : "image";
      const path = `ads/${adForm.advertiser || "sponsor"}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const r = ref(storage, path);
      const task = uploadBytesResumable(r, file, { contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg") });
      await new Promise((resolve, reject) => {
        task.on("state_changed",
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setUploadPct(pct);
          },
          reject,
          resolve
        );
      });
      const url = await getDownloadURL(task.snapshot.ref);
      setAdForm(f => ({ ...f, mediaUrl: url, mediaPath: path, mediaType: kind }));
    } catch (e) {
      alert(e?.message || "Upload failed");
    } finally {
      setUploading(false); setUploadPct(0);
    }
  }

  async function saveAd() {
    if (!canSaveAd) { alert("Please fill: " + missingFields.join(", ")); return; }
    try {
      const finalUrl = adForm.mediaUrl || adForm.externalUrl;
      const finalType = adForm.mediaUrl ? adForm.mediaType : (isVideoUrl(adForm.externalUrl) ? "video" : "image");
      const payload = {
        title: adForm.title.trim(),
        linkUrl: adForm.linkUrl.trim(),
        active: !!adForm.active,
        advertiser: adForm.advertiser || "sponsor",
        mediaUrl: finalUrl,
        mediaType: finalType,
        mediaPath: adForm.mediaUrl ? adForm.mediaPath : "",
        createdAt: serverTimestamp()
      };
      if (adForm.id) {
        await updateDoc(doc(db, "ads", adForm.id), payload);
      } else {
        await addDoc(collection(db, "ads"), payload);
      }
      // reset (keep advertiser for quick multiple uploads)
      setAdForm({
        id: null, title: "", linkUrl: "", active: true, advertiser: adForm.advertiser || "sponsor",
        mediaUrl: "", mediaPath: "", mediaType: "image", externalUrl: ""
      });
      alert("Ad saved");
    } catch (e) {
      console.error("saveAd failed:", e);
      alert("Could not save ad. Check Firestore rules and console.");
    }
  }

  async function editAd(a) {
    setAdForm({
      id: a.id || null,
      title: a.title || "",
      linkUrl: a.linkUrl || "",
      active: !!a.active,
      advertiser: a.advertiser || "sponsor",
      mediaUrl: a.mediaUrl || "",
      mediaPath: a.mediaPath || "",
      mediaType: a.mediaType || "image",
      externalUrl: ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeAd(a) {
    if (!confirm(`Delete ad “${a.title}”?`)) return;
    try {
      await deleteDoc(doc(db, "ads", a.id));
      alert("Ad deleted");
    } catch (e) {
      console.error("delete ad failed:", e);
      alert("Delete failed. Check permissions.");
    }
  }

  // ---------- Settings save ----------
  async function saveSettings() {
    try {
      await setDoc(doc(db, "settings", "site"), {
        siteName: settings.siteName || "Weatherfals",
        logoUrl: settings.logoUrl || "/weatherfals-logo.png",
        adPopupEnabled: !!settings.adPopupEnabled,
        adPopupIntervalSeconds: Number(settings.adPopupIntervalSeconds) || 51,
        adPopupInitialDelaySeconds: Number(settings.adPopupInitialDelaySeconds) || 5,
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert("Settings saved");
    } catch (e) {
      console.error("save settings failed:", e);
      alert("Could not save settings. Check rules and admin status.");
    }
  }

  // ---------- UI ----------
  if (isAdmin === null) {
    return <div className="container"><div className="info" style={{ marginTop:16 }}>Checking admin…</div></div>;
  }
  if (isAdmin === false) {
    return <div className="container">
      <div className="error" style={{ marginTop:16 }}>
        Admins only. {adminErr ? <span className="muted">({adminErr})</span> : null}
      </div>
    </div>;
  }

  const activeAds = ads.filter(a => a.active);

  return (
    <div className="container" style={{ paddingTop: 16 }}>
      <h2>Admin Dashboard</h2>

      {/* Tabs */}
      <div className="row" style={{ gap:8, margin:"12px 0" }}>
        <button className={tab==="ads"?"btn primary":"btn"} onClick={()=>setTab("ads")}>Ads</button>
        <button className={tab==="settings"?"btn primary":"btn"} onClick={()=>setTab("settings")}>Settings</button>
        <button className={tab==="users"?"btn primary":"btn"} onClick={()=>setTab("users")}>Users</button>
      </div>

      {/* ADS TAB */}
      {tab === "ads" && (
        <div className="card" style={{ padding:16 }}>
          <h3>Manage Ads</h3>

          <div className="grid" style={{ gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <input
                placeholder="Title"
                value={adForm.title}
                onChange={e=>setAdForm(f=>({ ...f, title:e.target.value }))}
              />
              <input
                placeholder="Link URL (when clicked)"
                value={adForm.linkUrl}
                onChange={e=>setAdForm(f=>({ ...f, linkUrl:e.target.value }))}
              />
              <div className="row" style={{ gap:8, alignItems:"center", margin:"8px 0" }}>
                <label><input type="checkbox" checked={adForm.active} onChange={e=>setAdForm(f=>({ ...f, active:e.target.checked }))}/> Active</label>
                <select value={adForm.advertiser} onChange={e=>setAdForm(f=>({ ...f, advertiser:e.target.value }))}>
                  <option value="sponsor">sponsor</option>
                  <option value="house">house</option>
                </select>
              </div>

              <div style={{ marginTop:6 }}>
                <div className="muted" style={{ marginBottom:6 }}>Upload image/video OR paste an external URL</div>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={e=>{
                    const f = e.target.files?.[0];
                    if (f) handleUploadFile(f);
                    e.target.value = "";
                  }}
                />
                {uploading && <div className="muted">Uploading… {uploadPct}%</div>}
                <input
                  placeholder="Or paste external media URL (optional)"
                  value={adForm.externalUrl}
                  onChange={e=>setAdForm(f=>({ ...f, externalUrl:e.target.value }))}
                  style={{ marginTop:6 }}
                />
              </div>

              <div className="row" style={{ gap:8, marginTop:10 }}>
                <button className="btn primary" disabled={!canSaveAd} onClick={saveAd}>
                  {adForm.id ? "Update Ad" : "Add Ad"}
                </button>
                <button className="btn" onClick={()=>{
                  setAdForm({
                    id:null, title:"", linkUrl:"", active:true, advertiser: adForm.advertiser || "sponsor",
                    mediaUrl:"", mediaPath:"", mediaType:"image", externalUrl:""
                  });
                }}>Clear</button>

                {/* Preview Popup */}
                <button className="btn" onClick={() => setPreview(p => !p)}>
                  {preview ? "Close Preview" : "Preview Popup"}
                </button>
              </div>

              <div className="muted" style={{ marginTop:8, fontSize:12 }}>
                Missing: {missingFields.join(", ") || "none ✅"}
              </div>
            </div>

            {/* Preview of current form media */}
            <div>
              <div className="muted" style={{ marginBottom:6 }}>Media Preview</div>
              {(() => {
                const url = adForm.mediaUrl || adForm.externalUrl;
                if (!url) return <div className="muted">No media selected</div>;
                const vid = isVideoUrl(url) || adForm.mediaType === "video";
                return vid
                  ? <video src={url} controls style={{ width:"100%", borderRadius:12 }} />
                  : <img src={url} alt="preview" style={{ width:"100%", borderRadius:12 }} />;
              })()}
            </div>
          </div>

          <hr style={{ margin:"16px 0", opacity:.2 }} />

          <div className="muted" style={{ marginBottom:6 }}>Existing Ads</div>
          <div className="grid" style={{ gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:12 }}>
            {ads.map(a=>(
              <div key={a.id} className="card mini">
                <div className="row space-between">
                  <b style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:140 }}>{a.title || "Untitled"}</b>
                  <span className={`badge ${a.active ? "active" : "banned"}`}>{a.active ? "ACTIVE" : "OFF"}</span>
                </div>
                <div className="muted" style={{ fontSize:12, marginTop:4 }}>{a.advertiser || "sponsor"} · {formatDate(a.createdAt?.toMillis?.() || a.createdAt)}</div>
                <div style={{ marginTop:8 }}>
                  {a.mediaUrl ? (
                    isVideoUrl(a.mediaUrl) || a.mediaType === "video"
                      ? <video src={a.mediaUrl} controls style={{ width:"100%", borderRadius:8 }} />
                      : <img src={a.mediaUrl} alt="" style={{ width:"100%", borderRadius:8 }} />
                  ) : <div className="muted">No media</div>}
                </div>
                <div className="row" style={{ gap:6, marginTop:8 }}>
                  <button className="btn" onClick={()=>editAd(a)}>Edit</button>
                  <button className="btn danger" onClick={()=>removeAd(a)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {tab === "settings" && (
        <div className="card" style={{ padding:16 }}>
          <h3>Site Settings</h3>

          {!settingsLoaded && <div className="muted">Loading…</div>}

          <div className="grid" style={{ gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <label className="muted">Site name</label>
              <input
                value={settings.siteName}
                onChange={e=>setSettings(s=>({ ...s, siteName:e.target.value }))}
              />
              <label className="muted" style={{ marginTop:8 }}>Logo URL</label>
              <input
                value={settings.logoUrl}
                onChange={e=>setSettings(s=>({ ...s, logoUrl:e.target.value }))}
                placeholder="/weatherfals-logo.png"
              />

              <div className="row" style={{ gap:8, marginTop:12 }}>
                <label><input type="checkbox" checked={!!settings.adPopupEnabled} onChange={e=>setSettings(s=>({ ...s, adPopupEnabled:e.target.checked }))}/> Enable popup ads</label>
              </div>

              <div className="row" style={{ gap:8, marginTop:8 }}>
                <input
                  type="number"
                  min={10}
                  value={settings.adPopupIntervalSeconds}
                  onChange={e=>setSettings(s=>({ ...s, adPopupIntervalSeconds:Number(e.target.value) }))}
                />
                <span className="muted">Interval (seconds)</span>
              </div>
              <div className="row" style={{ gap:8, marginTop:8 }}>
                <input
                  type="number"
                  min={0}
                  value={settings.adPopupInitialDelaySeconds}
                  onChange={e=>setSettings(s=>({ ...s, adPopupInitialDelaySeconds:Number(e.target.value) }))}
                />
                <span className="muted">Initial delay (seconds)</span>
              </div>

              <div className="row" style={{ gap:8, marginTop:12 }}>
                <button className="btn primary" onClick={saveSettings}>Save Settings</button>
              </div>
            </div>

            <div>
              <div className="muted">Logo Preview</div>
              <div style={{ marginTop:6 }}>
                <img
                  alt="logo"
                  src={settings.logoUrl || "/weatherfals-logo.png"}
                  style={{ height:56, borderRadius:8, background:"#fff", padding:6 }}
                  onError={(e)=>{ e.currentTarget.src="/weatherfals-logo.png"; }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* USERS TAB (read-only list) */}
      {tab === "users" && (
        <div className="card" style={{ padding:16 }}>
          <h3>Users</h3>
          <div className="grid" style={{ gridTemplateColumns:"repeat(auto-fill, minmax(240px,1fr))", gap:12 }}>
            {users.map(u=>(
              <div key={u.id} className="card mini">
                <div className="row" style={{ gap:8 }}>
                  {u.photo ? (
                    <img src={u.photo} alt="" style={{ height:36, width:36, borderRadius:"50%", objectFit:"cover" }} />
                  ) : (
                    <div style={{ height:36, width:36, borderRadius:"50%", background:"#ddd" }} />
                  )}
                  <div>
                    <div><b>{u.name || "Guest"}</b></div>
                    <div className="muted" style={{ fontSize:12 }}>{u.id}</div>
                  </div>
                </div>
                <div className="muted" style={{ fontSize:12, marginTop:6 }}>
                  Updated: {formatDate(u.updatedAt?.toMillis?.() || u.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline Preview Popup (admin-only; shows one immediately) */}
      {preview && (
        <AdPopup
          ads={activeAds}
          intervalMs={999999}
          initialDelayMs={0}
          forceShow={true}
        />
      )}
    </div>
  );
}
