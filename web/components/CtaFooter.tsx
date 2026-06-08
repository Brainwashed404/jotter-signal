// Closing call-to-action shown at the foot of the finite (non-infinite-scroll) pages.
export default function CtaFooter() {
  return (
    <div className="pt-8 mt-4 text-center" style={{ borderTop: "1px solid var(--border)" }}>
      <h3 className="text-lg font-semibold tracking-tight">
        Jotter helps brands turn cultural intelligence into commercial impact
      </h3>
      <div className="mt-4 flex items-center justify-center gap-3">
        <a href="https://www.jotter.media/" target="_blank" rel="noopener" className="btn">Find out more</a>
        <a href="https://www.linkedin.com/company/jottermedia/" target="_blank" rel="noopener"
          title="Jotter on LinkedIn" aria-label="Jotter on LinkedIn"
          className="grid place-items-center hover:opacity-80" style={{ color: "var(--muted)" }}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
            <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
          </svg>
        </a>
      </div>
    </div>
  );
}
