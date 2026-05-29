"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.getAttribute("data-theme") === "light");
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("jotter.theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("jotter.theme", "dark");
    }
  }

  return (
    <button
      onClick={toggle}
      className="px-2.5 py-1.5 rounded-lg text-sm hover:bg-[var(--panel-2)]"
      style={{ color: "var(--muted)" }}
      title={light ? "Switch to dark" : "Switch to daylight"}
      aria-label="Toggle theme"
    >
      {light ? "☾" : "☀"}
    </button>
  );
}
