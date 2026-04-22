import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { db, users } from "@/lib/db-client";
import { eq } from "drizzle-orm";

export async function GET() {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const rows = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
  const full = rows[0];
  return NextResponse.json({
    id: full?.id || u.id,
    email: full?.email || u.email,
    display_name: full?.displayName || full?.name || null,
    role: full?.role || "editor",
  });
}
