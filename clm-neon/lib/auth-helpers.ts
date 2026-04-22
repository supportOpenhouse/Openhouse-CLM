import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Returns the current user's session or null. Use in server components
 * that can redirect.
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user || null;
}

/**
 * Returns a 401 NextResponse if the user isn't signed in, otherwise returns
 * the user. Use at the top of every API route that requires auth.
 *
 *     const userOrError = await requireUser();
 *     if (userOrError instanceof NextResponse) return userOrError;
 *     const user = userOrError;
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Double-check domain (defense in depth)
  const allowed = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN || "openhouse.in";
  if (!session.user.email.toLowerCase().endsWith("@" + allowed.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session.user;
}

export async function requireAdmin() {
  const result = await requireUser();
  if (result instanceof NextResponse) return result;
  if (result.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return result;
}
