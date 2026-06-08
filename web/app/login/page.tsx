"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If somehow already authed, bounce home.
  useEffect(() => {
    const next = params.get("next") ?? "/";
    if (document.cookie.includes("jotter_auth=")) {
      router.replace(next);
    }
  }, [params, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });

    setLoading(false);

    if (res.ok) {
      const next = params.get("next") ?? "/";
      router.push(next);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Invalid code. Try again.");
    }
  }

  return (
    // Full-screen overlay — sits above the app chrome (header, sidebar).
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1.5rem",
    }}>
      <div style={{ width: "100%", maxWidth: "360px" }}>

        {/* Brand */}
        <div style={{ marginBottom: "2rem" }}>
          <p style={{
            fontSize: "0.65rem", fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--accent)", margin: "0 0 0.5rem",
          }}>
            Jotter
          </p>
          <h1 style={{
            fontSize: "1.5rem", fontWeight: 600,
            color: "var(--text)", margin: "0 0 0.4rem",
            lineHeight: 1.2,
          }}>
            Intelligence
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
            Enter your invite code to access the beta.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="INVITE CODE"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              padding: "0.7rem 0.9rem",
              marginBottom: "0.6rem",
              fontSize: "0.9rem",
              letterSpacing: "0.1em",
              fontFamily: "var(--font-mono, monospace)",
              background: "var(--panel)",
              border: "1.5px solid " + (error ? "var(--down, #e05252)" : "var(--border)"),
              borderRadius: "var(--radius, 6px)",
              color: "var(--text)",
              outline: "none",
            }}
          />

          {error && (
            <p style={{
              fontSize: "0.78rem", color: "var(--down, #e05252)",
              margin: "0 0 0.6rem",
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!code.trim() || loading}
            style={{
              display: "block",
              width: "100%",
              padding: "0.7rem 1rem",
              background: code.trim() && !loading ? "var(--accent)" : "var(--panel)",
              border: "1.5px solid " + (code.trim() && !loading ? "var(--accent)" : "var(--border)"),
              borderRadius: "var(--radius, 6px)",
              color: code.trim() && !loading ? "var(--on-accent, #1a1205)" : "var(--muted)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: code.trim() && !loading ? "pointer" : "default",
              transition: "background 0.15s, border-color 0.15s, color 0.15s",
            }}
          >
            {loading ? "Checking…" : "Continue →"}
          </button>
        </form>

        <p style={{
          fontSize: "0.72rem", color: "var(--muted)",
          marginTop: "1.5rem",
        }}>
          Need access?{" "}
          <a
            href="https://jotter.media"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            Contact Jotter
          </a>
        </p>

      </div>
    </div>
  );
}

// useSearchParams requires a Suspense boundary in Next.js App Router.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
