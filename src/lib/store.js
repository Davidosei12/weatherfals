// src/lib/store.js
import { nanoid } from "nanoid";

const KEYS = {
  ADMINS: "wa_admins",
  SESSION: "wa_session",
  USERS: "wa_users",
  ANALYTICS: "wa_analytics",
  SETTINGS: "wa_settings",
  ADS: "wa_ads",
  VISITOR_ID: "wa_visitor_id",
  PROFILE: "weather_profile", // already used by your app
  BANS: "wa_bans"
};

// --- helpers ---
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// --- visitor/user bootstrap ---
export function getOrCreateVisitor() {
  let id = localStorage.getItem(KEYS.VISITOR_ID);
  if (!id) {
    id = nanoid();
    localStorage.setItem(KEYS.VISITOR_ID, id);
    trackNewVisit(id);
  }
  // sync profile name/photo as user record
  const profile = read(KEYS.PROFILE, { name: "", photo: "" });
  upsertUser({ id, name: profile.name || "Guest", photo: profile.photo || "", lastSeen: Date.now(), banned: false, isAdmin: false });
  return id;
}

// --- users ---
export function listUsers() { return read(KEYS.USERS, []); }
export function upsertUser(u) {
  const users = listUsers();
  const i = users.findIndex(x => x.id === u.id);
  if (i >= 0) users[i] = { ...users[i], ...u };
  else users.unshift(u);
  write(KEYS.USERS, users);
}
export function setUserBanned(id, banned) {
  const users = listUsers().map(u => u.id === id ? { ...u, banned } : u);
  write(KEYS.USERS, users);
}
export function removeUser(id) {
  write(KEYS.USERS, listUsers().filter(u => u.id !== id));
}
export function promoteToAdmin(id) {
  const users = listUsers();
  const u = users.find(x => x.id === id);
  if (!u) return;
  u.isAdmin = true;
  write(KEYS.USERS, users);
  // also add to admins if not present
  const admins = read(KEYS.ADMINS, []);
  if (!admins.find(a => a.username === id)) {
    admins.push({ username: id, displayName: u.name || "Admin", password: null }); // password null since device-based
    write(KEYS.ADMINS, admins);
  }
}

// --- analytics ---
export function trackNewVisit(userId) {
  const a = read(KEYS.ANALYTICS, { visits: [], searches: [] });
  a.visits.unshift({ userId, at: Date.now(), type: "visit" });
  write(KEYS.ANALYTICS, a);
}
export function trackSearch(userId, query) {
  const a = read(KEYS.ANALYTICS, { visits: [], searches: [] });
  a.searches.unshift({ userId, q: query, at: Date.now() });
  write(KEYS.ANALYTICS, a);
}
export function getAnalytics() { return read(KEYS.ANALYTICS, { visits: [], searches: [] }); }

// --- settings ---
export function getSettings() {
  return read(KEYS.SETTINGS, { siteName: "Weather", logoUrl: "" });
}
export function saveSettings(s) { write(KEYS.SETTINGS, s); }

// --- ads ---
export function listAds() { return read(KEYS.ADS, []); }
export function saveAd(ad) {
  const ads = listAds();
  if (ad.id) {
    const i = ads.findIndex(x => x.id === ad.id);
    if (i >= 0) ads[i] = { ...ads[i], ...ad };
  } else {
    ad.id = nanoid();
    ads.unshift(ad);
  }
  write(KEYS.ADS, ads);
}
export function removeAd(id) { write(KEYS.ADS, listAds().filter(a => a.id !== id)); }

// --- admin auth (demo) ---
export function listAdmins() { return read(KEYS.ADMINS, []); }
export function createAdmin({ username, password, displayName }) {
  const admins = listAdmins();
  if (admins.find(a => a.username === username)) throw new Error("Username already exists");
  admins.push({ username, password, displayName });
  write(KEYS.ADMINS, admins);
}
export function loginAdmin({ username, password }) {
  const a = listAdmins().find(x => x.username === username && x.password === password);
  if (!a) throw new Error("Invalid credentials");
  const session = { username: a.username, displayName: a.displayName, at: Date.now() };
  write(KEYS.SESSION, session);
  return session;
}
export function getSession() { return read(KEYS.SESSION, null); }
export function logoutAdmin() { localStorage.removeItem(KEYS.SESSION); }

// utility: format time
export const fmt = (ts) => new Date(ts).toLocaleString();
