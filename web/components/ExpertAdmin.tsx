"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type UploadRef = { upload_id: string; upload_name: string; chunks: number; date: string };

export default function ExpertAdmin({
  expertId, uploads, name: initialName, blurb: initialBlurb, editable,
}: { expertId: string; uploads: UploadRef[]; name: string; blurb: string; editable: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [blurb, setBlurb] = useState(initialBlurb);
  const [feedUrl, setFeedUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function attachPdf(file: File) {
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "archive");
      fd.append("expertId", expertId);
      const res = await fetch("/api/upload-pdf", { method: "POST", body: fd });
      const d = await res.json();
      setMsg(res.ok ? `Attached “${d.title}”${d.date ? ` (dated ${d.date})` : ""}.` : d.error || "Upload failed.");
      if (res.ok) router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function attachFeed() {
    if (!feedUrl.trim()) { setMsg("Enter a feed URL."); return; }
    setBusy(true); setMsg(null);
    const res = await fetch("/api/sources", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedUrl: feedUrl.trim(), id: expertId }),
    });
    const d = await res.json();
    setBusy(false);
    setMsg(res.ok ? `Added ${d.added} item${d.added === 1 ? "" : "s"} from feed.` : d.error || "Couldn't add feed.");
    if (res.ok) { setFeedUrl(""); router.refresh(); }
  }

  async function saveProfile() {
    if (!name.trim()) { setMsg("Name can't be empty."); return; }
    setBusy(true); setMsg(null);
    const res = await fetch("/api/sources", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: expertId, name: name.trim(), blurb: blurb.trim() }),
    });
    setBusy(false);
    if (res.ok) { setMsg("Saved."); router.refresh(); } else setMsg((await res.json()).error || "Save failed.");
  }

  async function removeUpload(uploadId: string, label: string) {
    if (!confirm(`Remove “${label}”?`)) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/sources?id=${encodeURIComponent(expertId)}&upload=${encodeURIComponent(uploadId)}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh(); else setMsg((await res.json()).error || "Delete failed.");
  }

  async function removeProfile() {
    if (!confirm("Delete this entire profile and all its documents? This can't be undone.")) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/sources?id=${encodeURIComponent(expertId)}`, { method: "DELETE" });
    if (res.ok) router.push(window.location.pathname.includes("publications") ? "/publications" : "/sources");
    else { setBusy(false); setMsg((await res.json()).error || "Delete failed."); }
  }

  return (
    <section className="panel p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm">{editable ? "Manage this profile" : "Add to this profile"}</div>
        {editable && (
          <button onClick={removeProfile} disabled={busy} className="label hover:underline" style={{ color: "var(--down)" }}>
            Delete profile
          </button>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap gap-2 items-center">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Profile name" className="px-3 py-2 text-sm flex-1 min-w-[180px]" />
          <input value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Blurb" className="px-3 py-2 text-sm flex-1 min-w-[180px]" />
          <button className="btn" disabled={busy} onClick={saveProfile}>Save profile</button>
        </div>
      )}

      {uploads.length > 0 && (
        <div className="flex flex-col gap-1">
          {uploads.map((u) => (
            <div key={u.upload_id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">📄 {u.upload_name}</span>
              <span className="label shrink-0">{u.date}</span>
              <button onClick={() => removeUpload(u.upload_id, u.upload_name)} disabled={busy}
                className="label hover:underline shrink-0" style={{ color: "var(--down)" }} title="Remove this document">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) attachPdf(f); }} />
        <button className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Working…" : "Attach a PDF"}
        </button>
        <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="…or an RSS feed URL"
          className="px-3 py-2 text-sm flex-1 min-w-[200px]" />
        <button className="btn-ghost" disabled={busy} onClick={attachFeed}>Add feed</button>
      </div>
      {msg && <div className="label" style={{ textTransform: "none", letterSpacing: 0 }}>{msg}</div>}
    </section>
  );
}
