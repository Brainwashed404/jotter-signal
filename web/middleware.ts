import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const AUTH_COOKIE = "jotter_auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // If INVITE_CODES is not set, auth is disabled (local dev, or not yet configured).
  const raw = process.env.INVITE_CODES ?? "";
  if (!raw.trim()) return NextResponse.next();

  // Always allow the login page, auth API, and Next.js internals through.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Validate the auth cookie.
  const cookie = request.cookies.get(AUTH_COOKIE)?.value ?? "";
  const valid = raw.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);

  if (!cookie || !valid.includes(cookie.toUpperCase())) {
    const login = new URL("/login", request.url);
    // Preserve the intended destination so we can redirect back after login.
    login.searchParams.set("next", pathname);
    const res = NextResponse.redirect(login);
    if (cookie) res.cookies.delete(AUTH_COOKIE); // clear stale/revoked cookie
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
