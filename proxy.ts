import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Renamed from `middleware.ts` to `proxy.ts` per Next.js 16 (see
 * node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
 *
 * Protects everything except /login and /api/auth/* (SPEC.md Section 3.2).
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic = pathname === "/login" || pathname.startsWith("/api/auth");

  if (isPublic) {
    return NextResponse.next();
  }

  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
