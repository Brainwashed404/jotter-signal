import Generator from "@/components/Generator";

export default function GeneratePage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="label">Reports</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Build a research report</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Two ways to build: from a <strong>topic</strong> (searches the whole corpus) or from your
          own <strong>report basket</strong> — the signals and highlighted excerpts you collected in
          Saved, with your annotations. Either way you get a clean, sourced, dated document to
          download as Markdown and finish in your own voice.
        </p>
      </div>
      <Generator />
    </div>
  );
}
