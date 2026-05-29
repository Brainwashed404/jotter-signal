import Generator from "@/components/Generator";

export default function GeneratePage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="label">Generator</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Build a research pack</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Give it a topic and it compiles a clean, sourced document from the archive — his
          commentary, the articles he linked, relevant quotes and books — dated and cited, ready to
          download as Markdown and finish in your own voice.
        </p>
      </div>
      <Generator />
    </div>
  );
}
