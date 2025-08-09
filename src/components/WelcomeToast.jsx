import { useEffect } from "react";

export default function WelcomeToast({ name, show, onClose, ms = 3000 }) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [show, ms, onClose]);

  if (!show) return null;

  return (
    <div className="welcome-toast">
      <div className="welcome-card">
        <span>Welcome, <strong className="cap">{name}</strong> 👋</span>
      </div>
    </div>
  );
}
