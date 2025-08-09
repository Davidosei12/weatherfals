import { useEffect, useRef, useState } from "react";

export default function Profile({ profile, setProfile }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef(null);
  const [name, setName] = useState(profile?.name || "");
  const [photo, setPhoto] = useState(profile?.photo || "");

  // Keep local inputs in sync when parent changes (e.g., first load)
  useEffect(() => {
    setName(profile?.name || "");
    setPhoto(profile?.photo || "");
  }, [profile]);

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem("weather_profile");
      if (raw) {
        const p = JSON.parse(raw);
        setProfile(p);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadFromStorage();
  }, []);

  function saveProfile(next) {
    setProfile(next);
    try { localStorage.setItem("weather_profile", JSON.stringify(next)); } catch {}
  }

  function onFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(f);
  }

  function onSave() {
    saveProfile({ name: name.trim(), photo });
    setOpen(false);
  }

  function onClearPhoto() {
    setPhoto("");
  }

  return (
    <>
      <button
        className="avatar-btn"
        onClick={() => setOpen(v => !v)}
        title={profile?.name ? `Profile: ${profile.name}` : "Set profile"}
      >
        {profile?.photo ? (
          <img alt="avatar" src={profile.photo} className="avatar" />
        ) : (
          <div className="avatar placeholder">+</div>
        )}
      </button>

      {open && (
        <div className="profile-backdrop" onClick={() => setOpen(false)}>
          <div className="profile-panel card" onClick={e => e.stopPropagation()}>
            <div className="panel-header">
              <div className="panel-title">Edit Profile</div>
            </div>

            <div className="row wrap" style={{ gap: 16 }}>
              {photo ? (
                <img alt="preview" src={photo} className="avatar large" />
              ) : (
                <div className="avatar large placeholder">+</div>
              )}
              <div className="row wrap" style={{ gap: 8 }}>
                <button onClick={() => fileRef.current?.click()}>Upload photo</button>
                {photo && <button onClick={onClearPhoto}>Remove photo</button>}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={onFileChange}
                />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label className="label">Display name</label>
              <input
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="row space-between" style={{ marginTop: 16 }}>
              <button onClick={() => setOpen(false)}>Cancel</button>
              <button onClick={onSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
