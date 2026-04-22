import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));

  // Allow unauthenticated access to public paths
  if (!req.auth) {
    if (isPublic) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // Domain enforcement — defense in depth
  const allowed = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || "openhouse.in";
  const email = req.auth.user?.email;
  if (email && !email.toLowerCase().endsWith("@" + allowed.toLowerCase())) {
    const url = req.nextUrl.clone();
    url.pathname = "/api/auth/signout";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
