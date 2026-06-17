"use client";
import { useRef, useState, type ReactNode } from "react";

/**
 * Horizontal swipe between "pages" of content (news categories, insight sources,
 * radio genres). Gives live drag feedback as the finger moves and a directional
 * slide-in whenever the page changes — including when changed externally, e.g. by
 * tapping a pill (drive that via the `dir` prop).
 *
 * Axis-locked and `touch-action: pan-y`, so vertical page scrolling still works and
 * iOS Safari's back/forward edge-swipe doesn't hijack the gesture (the bug that made
 * the earlier swipe handlers silently do nothing on a real phone).
 */
export function SwipeView({
  pageKey, dir, hasPrev, hasNext, onPrev, onNext, children, className,
}: {
  pageKey: string | number;   // changing this replays the slide-in
  dir: number;                // 1 = came from the right (next), -1 = from the left (prev)
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const dxRef = useRef(0); // live delta for the release decision (state can be stale on a fast flick)

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    axis.current = null;
    dxRef.current = 0;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.touches[0];
    const mx = t.clientX - start.current.x;
    const my = t.clientY - start.current.y;
    // Lock to an axis once the finger has clearly committed to a direction.
    if (!axis.current && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      axis.current = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (axis.current === "x") setDragging(true);
    }
    if (axis.current === "x") {
      const blocked = (mx > 0 && !hasPrev) || (mx < 0 && !hasNext);
      const shown = blocked ? mx * 0.3 : mx; // rubber-band at the ends
      dxRef.current = shown;
      setDx(shown);
    }
  }
  function onTouchEnd() {
    const mx = dxRef.current;
    const wasX = axis.current === "x";
    start.current = null;
    axis.current = null;
    dxRef.current = 0;
    setDragging(false);
    setDx(0);
    if (!wasX) return;
    const THRESHOLD = 50;
    if (mx <= -THRESHOLD && hasNext) onNext();
    else if (mx >= THRESHOLD && hasPrev) onPrev();
  }

  return (
    <div
      className={`overflow-hidden ${className ?? ""}`}
      style={{ touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform 220ms cubic-bezier(0.22,1,0.36,1)" }}>
        <div key={pageKey} style={{ animation: `jslide-${dir >= 0 ? "next" : "prev"} 280ms cubic-bezier(0.4,0,0.2,1)` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
