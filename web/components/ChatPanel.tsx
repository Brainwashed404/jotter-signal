"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatPanel({
  starter,
  context,
  onClose,
}: {
  starter: string;
  context: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentStarter = useRef(false);

  // Auto-send the thought starter on first mount
  useEffect(() => {
    if (sentStarter.current) return;
    sentStarter.current = true;
    send(starter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setStreaming(true);

    // Optimistically add the assistant slot so the cursor shows immediately
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });
      if (!res.ok || !res.body) throw new Error("request failed");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "Something went wrong. Please try again." };
        return copy;
      });
    } finally {
      setStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    // Backdrop (tap outside to close on mobile)
    <div
      className="fixed inset-0 z-50"
      style={{ pointerEvents: "none" }}
    >
      {/* Translucent backdrop on mobile only */}
      <div
        className="absolute inset-0 md:hidden"
        style={{ background: "rgba(0,0,0,0.35)", pointerEvents: "auto" }}
        onClick={onClose}
      />

      {/* Panel — bottom sheet on mobile, fixed bottom-right on desktop */}
      <div
        className="absolute bottom-0 left-0 right-0 md:bottom-6 md:right-6 md:left-auto md:w-[460px] flex flex-col"
        style={{
          maxHeight: "80dvh",
          pointerEvents: "auto",
          borderRadius: "10px 10px 0 0",
        }}
      >
        <div
          className="panel flex flex-col"
          style={{
            maxHeight: "80dvh",
            overflow: "hidden",
            borderRadius: "10px 10px 0 0",
            boxShadow: "0 -4px 32px rgba(0,0,0,0.18)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-start gap-3 px-5 py-4 shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--muted)" }}>
                Thought Starter
              </p>
              <p className="text-sm leading-snug line-clamp-3">{starter}</p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-7 h-7 grid place-items-center rounded-md hover:bg-[var(--panel-2)] transition-colors"
              style={{ color: "var(--muted)" }}
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="13" y2="13" />
                <line x1="13" y1="1" x2="1" y2="13" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <span
                    className="chip inline-block text-left"
                    style={{
                      maxWidth: "88%",
                      whiteSpace: "normal",
                      lineHeight: 1.55,
                      padding: "8px 14px",
                      fontSize: "13px",
                    }}
                  >
                    {m.content}
                  </span>
                ) : (
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--body-text)", whiteSpace: "pre-wrap" }}
                  >
                    {m.content || (
                      <span className="animate-pulse" style={{ color: "var(--muted)" }}>thinking…</span>
                    )}
                  </p>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="flex gap-2 px-4 py-3 shrink-0"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              placeholder="Follow up…"
              disabled={streaming}
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: "var(--text)" }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || streaming}
              className="chip shrink-0 text-xs"
              style={input.trim() && !streaming ? { color: "var(--accent)", borderColor: "var(--accent)" } : { opacity: 0.4 }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
