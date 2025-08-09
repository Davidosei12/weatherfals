// src/lib/firebaseStore.js
// Uses modular SDK + single app instance from ./firebase

import { auth, db, storage } from "@/lib/firebase";

// Auth
import {
  onAuthStateChanged,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";

// Firestore
import {
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
} from "firebase/firestore";

// Storage
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

/* =====================================
   AUTH
   ===================================== */

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export async function ensureAnon() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  return auth.currentUser;
}

export async function adminSignup({ email, password, displayName }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(cred.user, { displayName });

  // mark as admin
  await setDoc(doc(db, "admins", cred.user.uid), {
    createdAt: serverTimestamp(),
    displayName: displayName || "Admin",
  });

  // ensure user profile
  await setDoc(
    doc(db, "users", cred.user.uid),
    {
      name: displayName || "Admin",
      photo: "",
      banned: false,
      isAdmin: true,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    },
    { merge: true }
  );

  return cred.user;
}

export async function adminLogin({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const aDoc = await getDoc(doc(db, "admins", cred.user.uid));
  if (!aDoc.exists()) {
    await signOut(auth);
    throw new Error("Not an admin account");
  }
  return cred.user;
}

export async function adminLogout() {
  await signOut(auth);
}

export async function isCurrentUserAdmin() {
  const u = auth.currentUser;
  if (!u) return false;
  const aDoc = await getDoc(doc(db, "admins", u.uid));
  return aDoc.exists();
}

/* =====================================
   USERS
   ===================================== */

export async function upsertUserProfile({ name, photo }) {
  const u = auth.currentUser || (await ensureAnon());
  await setDoc(
    doc(db, "users", u.uid),
    {
      name: name || "Guest",
      photo: photo || "",
      banned: false,
      lastSeen: serverTimestamp(),
    },
    { merge: true }
  );
  return u.uid;
}

export function watchUsers(cb) {
  return onSnapshot(collection(db, "users"), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

export async function setUserBanned(uid, banned) {
  await updateDoc(doc(db, "users", uid), { banned: !!banned });
}

export async function removeUser(uid) {
  await deleteDoc(doc(db, "users", uid));
}

export async function promoteToAdmin(uid) {
  await setDoc(
    doc(db, "admins", uid),
    { createdAt: serverTimestamp() },
    { merge: true }
  );
  await updateDoc(doc(db, "users", uid), { isAdmin: true });
}

/* =====================================
   ANALYTICS
   ===================================== */

export async function trackVisit() {
  const u = await ensureAnon();
  await addDoc(collection(db, "visits"), {
    uid: u.uid,
    at: serverTimestamp(),
    type: "visit",
  });
}

export async function trackSearch(qstr) {
  const u = await ensureAnon();
  await addDoc(collection(db, "searches"), {
    uid: u.uid,
    q: qstr,
    at: serverTimestamp(),
  });
}

export function watchAnalytics(cb) {
  const qVisits = query(collection(db, "visits"), orderBy("at", "desc"));
  const qSearch = query(collection(db, "searches"), orderBy("at", "desc"));

  const un1 = onSnapshot(qVisits, (s) =>
    cb({ type: "visits", docs: s.docs.map((d) => ({ id: d.id, ...d.data() })) })
  );
  const un2 = onSnapshot(qSearch, (s) =>
    cb({ type: "searches", docs: s.docs.map((d) => ({ id: d.id, ...d.data() })) })
  );
  return () => {
    un1();
    un2();
  };
}

/* =====================================
   SETTINGS
   ===================================== */

export function watchSettings(cb) {
  return onSnapshot(doc(db, "settings", "site"), (d) => {
    if (d.exists()) cb(d.data());
    else cb({ siteName: "Weatherfals", logoUrl: "" });
  });
}

export async function saveSettings(s) {
  await setDoc(
    doc(db, "settings", "site"),
    { ...s, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/* =====================================
   ADS (FIRESTORE)
   ===================================== */

export function watchAds(cb) {
  return onSnapshot(collection(db, "ads"), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

export async function saveAd(ad) {
  const payload = {
    title: ad.title || "",
    linkUrl: ad.linkUrl || "",
    active: ad.active ?? true,
    mediaUrl: ad.mediaUrl || "",
    mediaPath: ad.mediaPath || "",
    mediaType: ad.mediaType || "image", // "image" | "video"
    advertiser: ad.advertiser || "sponsor",
    updatedAt: serverTimestamp(),
  };

  if (ad.id) {
    await updateDoc(doc(db, "ads", ad.id), payload);
  } else {
    await addDoc(collection(db, "ads"), {
      ...payload,
      createdAt: serverTimestamp(),
    });
  }
}

export async function removeAdById(id) {
  await deleteDoc(doc(db, "ads", id));
}

/* =====================================
   ADS (STORAGE UPLOAD/DELETE)
   ===================================== */

export async function uploadAdAsset(file, advertiser = "sponsor") {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `ads/${advertiser}/${key}.${ext}`;
  const r = ref(storage, path);

  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  const mediaType = file.type?.startsWith("video/") ? "video" : "image";

  return { url, path, mediaType };
}

export async function deleteAdAsset(path) {
  if (!path) return;
  try {
    const assetRef = ref(storage, path);
    await deleteObject(assetRef);
  } catch (e) {
    console.error("deleteAdAsset error:", e);
  }
}

// Optional: one-liner to replace media on existing ad
export async function replaceAdMedia(adId, file, advertiser = "sponsor") {
  const up = await uploadAdAsset(file, advertiser);
  await updateDoc(doc(db, "ads", adId), {
    mediaUrl: up.url,
    mediaPath: up.path,
    mediaType: up.mediaType,
    updatedAt: serverTimestamp(),
  });
  return up;
}
