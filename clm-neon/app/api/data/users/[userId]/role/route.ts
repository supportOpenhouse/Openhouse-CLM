import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { db, users } from "@/lib/db-client";
import { eq, sql } from "drizzle-orm";

export async function PATCH(request: Request, { params }: { params: { userId: string } }) {
  const u = await requireAdmin();
  if (u instanceof NextResponse) return u;

  const { role } = await request.json();
  if (role !== "admin" && role !== "editor") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // If demoting an admin, ensure at least one admin remains
  if (role === "editor") {
    const result = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from users where role = 'admin' and id != ${params.userId}`
    );
    const count = result.rows[0]?.count ?? 0;
    if (count === 0) {
      return NextResponse.json({ error: "Cannot demote the last admin" }, { status: 400 });
    }
  }

  await db.update(users).set({ role }).where(eq(users.id, params.userId));
  return NextResponse.json({ ok: true });
}
