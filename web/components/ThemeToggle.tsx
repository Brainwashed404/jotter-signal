"use client";
import { useEffect, useState } from "react";
import { APPEARANCE_EVENT } from "@/lib/appearance";

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const sync = () => setLight(document.documentElement.getAttribute("data-theme") === "light");
    sync();
    window.addEventListener(APPEARANCE_EVENT, sync);
    return () => window.removeEventListener(APPEARANCE_EVENT, sync);
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("jotter.theme.v2", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("jotter.theme.v2", "dark");
    }
  }

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center justify-center px-2 py-1.5 rounded-lg hover:bg-[var(--panel-2)]"
      style={{ color: "var(--muted)" }}
      title={light ? "Switch to dark" : "Switch to daylight"}
      aria-label="Toggle theme"
    >
      <span key={String(light)} className="theme-icon">
        {light ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.752 15.002A9.718 9.718 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z" />
          </svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        )}
      </span>
    </button>
  );
}
