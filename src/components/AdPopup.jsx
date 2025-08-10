import { useEffect, useMemo, useRef, useState } from "react";

/** Simple media-type detection from url or explicit mediaType */
function isVideo(url = "", mediaType = "") {
  if (mediaType === "video") return true;
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(url);
}

/**
 * Popup ad that rotates through active ads.
 * Props:
 *  - ads: [{ title, linkUrl, mediaUrl, mediaType, active, startAt?, endAt? }, ...]
 *  - intervalMs: how often to show again (default 51s)
 *  - initialDelayMs: delay for first popup (default 5s)
 *  - forceShow: boolean; when true, instantly shows one ad (for Admin preview)
 *  - sessionCap: max times to show per browser session (default 8)
 */
export default function AdPopup({
  ads = [],
  intervalMs = 51000,
  initialDelayMs = 5000,
  forceShow = false,
  sessionCap = 8,
}) {
  const now = Date.now();

  // Filter to only ads that are usable right now
  const activeAds = useMemo(() => {
    return (ads || []).filter(a => {
      if (!a) return false;
      if (!a.active) return false;
      if (!a.mediaUrl) return false;
      if (a.startAt && now < a.startAt) return false;
      if (a.endAt && now > a.endAt) return false;
      return true;
    });
  }, [ads, now]);

  const [visible, setVisible] = useState(false);
  const [ad, setAd] = useState(null);
  const videoRef = useRef(null);
  const firstTimer = useRef(null);
  const repeatTimer = useRef(null);

  // Session impression cap
  const canShow = () => {
    try {
      const n = Number(sessionStorage.getItem("wf_ad_impressions") || "0");
      return n < sessionCap;
    } catch { return true; }
  };
  const bump = () => {
    try {
      const n = Number(sessionStorage.getItem("wf_ad_impressions") || "0");
      sessionStorage.setItem("wf_ad_impressions", String(n + 1));
    } catch {}
  };

  const pickAd = () => {
    if (!activeAds.length) return null;
    const idx = Math.floor(Math.random() * activeAds.length);
    return activeAds[idx];
  };

  const showOnce = (bypassCap = false) => {
    if (!activeAds.length) return;
    if (!bypassCap && !canShow()) return;

    const next = pickAd();
    if (!next) return;
    setAd(next);
    setVisible(true);
    if (!bypassCap) bump();

    // try to autoplay video nicely
    requestAnimationFrame(() => {
      const v = videoRef.current;
      if (v) { v.currentTime = 0; v.play().catch(() => {}); }
    });
  };

  const hide = () => {
    setVisible(false);
    const v = videoRef.current;
    if (v) { try { v.pause(); } catch {} }
  };

  // Manual preview trigger (admin)
  useEffect(() => {
    if (forceShow) showOnce(true); // bypass cap for preview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceShow]);

  // Automatic rotation (user site)
  useEffect(() => {
    // clear old timers
    if (firstTimer.current) clearTimeout(firstTimer.current);
    if (repeatTimer.current) clearInterval(repeatTimer.current);

    if (!activeAds.length) return;

    firstTimer.current = setTimeout(() => showOnce(false), initialDelayMs);
    repeatTimer.current = setInterval(() => showOnce(false), intervalMs);

    return () => {
      if (firstTimer.current) clearTimeout(firstTimer.current);
      if (repeatTimer.current) clearInterval(repeatTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAds, intervalMs, initialDelayMs]);

  if (!visible || !ad) return null;

  const mediaUrl = ad.mediaUrl;
  const isVid = isVideo(mediaUrl, ad.mediaType);

  return (
    <div className="ad-overlay" role="dialog" aria-modal="true" onClick={hide}>
      <div className="ad-box" onClick={(e)=>e.stopPropagation()}>
        <button className="ad-close" aria-label="Close ad" onClick={hide}>×</button>

        <a className="ad-media-link" href={ad.linkUrl || "#"} target="_blank" rel="noreferrer">
          {isVid ? (
            <video
              ref={videoRef}
              src={mediaUrl}
              muted
              loop
              playsInline
              controls
              style={{ width: "100%", borderRadius: 12 }}
            />
          ) : (
            <img
              src={mediaUrl}
              alt={ad.title || "Ad"}
              style={{ width: "100%", borderRadius: 12, display: "block" }}
            />
          )}
        </a>

        {ad.title && <div className="ad-title">{ad.title}</div>}
      </div>
    </div>
  );
}
