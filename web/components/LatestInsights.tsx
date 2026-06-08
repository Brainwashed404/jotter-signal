"use client";
import { SignalCard } from "@/components/SignalCard";
import type { Signal } from "@/lib/types";

export default function LatestInsights({ signals }: { signals: Signal[] }) {
  return (
    <div className="grid md:grid-cols-2 gap-2">
      {signals.map((s) => <SignalCard key={s.source_id} s={s} />)}
    </div>
  );
}
