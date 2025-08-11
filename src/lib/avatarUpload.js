// src/lib/avatarUpload.js
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth";

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

export async function uploadAvatarIfNeeded(photo) {
  if (!photo) return "";
  // already an http(s) URL? keep it
  if (typeof photo === "string" && /^https?:\/\//i.test(photo)) return photo;

  let blob = null, ext = "jpg";
  if (typeof photo === "string" && photo.startsWith("data:")) {
    blob = await dataUrlToBlob(photo);
    const m = /^data:image\/(png|jpe?g|webp)/i.exec(photo);
    if (m) ext = m[1] === "jpeg" ? "jpg" : m[1];
  } else if (photo instanceof File || photo instanceof Blob) {
    blob = photo;
    if (photo.type.includes("png")) ext = "png";
    else if (photo.type.includes("webp")) ext = "webp";
    else if (photo.type.includes("jpeg")) ext = "jpg";
  } else {
    return "";
  }

  // optional size guard
  if (blob.size > 1024 * 1024 * 3) {
    throw new Error("Avatar too large. Choose an image under 3 MB.");
  }

  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  const storage = getStorage();
  const path = `users/${uid}/avatar.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: blob.type || "image/jpeg" });
  return await getDownloadURL(r);
}
