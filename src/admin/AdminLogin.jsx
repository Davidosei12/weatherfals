import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin, adminSignup, watchAuth, isCurrentUserAdmin } from "../lib/firebaseStore";

export default function AdminLogin() {
  const nav = useNavigate();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const unsub = watchAuth(async (u) => {
      if (u && (await isCurrentUserAdmin())) nav("/admin/dashboard");
    });
    return unsub;
  }, [nav]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      if (mode === "signup") {
        if (!email || !password || !displayName) throw new Error("Fill all fields");
        await adminSignup({ email, password, displayName });
      } else {
        if (!email || !password) throw new Error("Fill all fields");
        await adminLogin({ email, password });
      }
      nav("/admin/dashboard");
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="container" style={{ paddingTop: 32 }}>
      <div className="card" style={{ maxWidth: 460, margin: "0 auto" }}>
        <h2 style={{ marginTop: 0 }}>{mode === "login" ? "Admin Login" : "Create Admin"}</h2>
        <form onSubmit={onSubmit} className="column" style={{ display:"grid", gap:12 }}>
          <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          {mode === "signup" && (
            <input placeholder="Display name" value={displayName} onChange={e=>setDisplayName(e.target.value)} />
          )}
          <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          {err && <div className="error">{err}</div>}
          <button type="submit">{mode === "login" ? "Login" : "Create admin"}</button>
        </form>
        <div className="muted" style={{ marginTop: 10 }}>
          {mode === "login" ? (
            <>No admin? <button onClick={()=>setMode("signup")}>Create one</button></>
          ) : (
            <>Have an account? <button onClick={()=>setMode("login")}>Login</button></>
          )}
        </div>
      </div>
    </div>
  );
}
