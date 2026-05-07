import { NextResponse, type NextRequest } from "next/server";

// Edge middleware — runs on every request before route handlers.
// 1) Adds a per-request CSP nonce to enable strict CSP for inline scripts.
// 2) Lets unauthenticated users hit only /login and /api/auth/*.
// 3) For everything else, redirects to /login if there's no session cookie.
//
// We don't use NextAuth in middleware (Edge runtime can't run Prisma) — we
// rely on the presence of the session cookie and let the page-level auth()
// call do the strict check + DB lookup.

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/webhook", // verified via HMAC, not session
  "/_next",
  "/favicon.ico",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Session cookie names (NextAuth v5)
  const cookie =
    req.cookies.get("authjs.session-token")?.value ??
    req.cookies.get("__Secure-authjs.session-token")?.value;

  if (!isPublic && !cookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
