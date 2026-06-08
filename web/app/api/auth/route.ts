import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/middleware";

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();

  const raw = process.env.INVITE_CODES ?? "";
  const valid = raw.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);

  if (!code || (valid.length > 0 && !valid.includes(code))) {
    return NextResponse.json({ error: "Invalid invite code." }, { status: 401 });
  }

  // Each login appears in Vercel's function logs — your audit trail for beta usage.
  console.log(`[auth] access granted: ${code} — ${new Date().toISOString()}`);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
  return res;
}

// DELETE clears the session — used by the sign-out button.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
