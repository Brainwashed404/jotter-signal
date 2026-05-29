import Generator from "@/components/Generator";

export default function GeneratePage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="label">Generator</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Turn signal into output</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Produce client-ready foresight, grounded in real signals and cited. Without an API key
          you get the evidence pack; add one to auto-synthesise the finished piece.
        </p>
      </div>
      <Generator />
    </div>
  );
}
