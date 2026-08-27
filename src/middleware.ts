/**
 * SOLO-USER STUB — middleware is a pass-through. No auth cookie check,
 * no /login redirect. Pairs with the stubbed lib/auth.ts.
 *
 * WHY: with the auth stub, every request is treated as signed-in, so
 * there's nothing for middleware to gate. Keeping the file (rather than
 * deleting it) preserves the ability to add real edge-level checks later
 * (rate limits, security headers, geo blocks) without a routing change.
 */
import { NextResponse, type NextRequest } from "next/server";

export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
