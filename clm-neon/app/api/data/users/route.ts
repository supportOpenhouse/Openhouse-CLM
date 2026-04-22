import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { db, users } from "@/lib/db-client";
import { asc } from "drizzle-orm";

export async function GET() {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const rows = await db.select().from(users).orderBy(asc(users.role), asc(users.email));
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      display_name: r.displayName || r.name,
      role: r.role,
      first_login: r.firstLogin,
      last_login: r.lastLogin,
    }))
  );
}
