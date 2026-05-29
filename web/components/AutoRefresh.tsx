"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// On load, ask the server to check feeds for new content (throttled server-side).
// If it pulled anything new, refresh the route so it shows.
export default function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    fetch("/api/refresh", { method: "POST" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.refreshed) router.refresh(); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [router]);
  return null;
}
