// src/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously 
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ✅ Your Firebase config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// ✅ Initialize app only once
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// ✅ Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ✅ Sign in anonymously if no user
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch((err) => {
      console.error("Anon sign-in failed:", err);
    });
  }
});

// ✅ Expose Firebase to browser console for debugging
if (typeof window !== "undefined") {
  window.firebaseApp = { app, auth, db, storage };
  console.log(
    "%c[Firebase Debug Ready] Type firebaseApp in console to inspect.",
    "color: green; font-weight: bold;"
  );
}

export { app, auth, db, storage };
