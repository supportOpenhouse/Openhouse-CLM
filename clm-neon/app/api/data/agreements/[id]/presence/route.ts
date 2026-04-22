import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { db, presence } from "@/lib/db-client";
import { eq, and, gte, sql } from "drizzle-orm";

// Heartbeat: upsert my presence row
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  await db
    .insert(presence)
    .values({ agreementId: params.id, userEmail: u.email, lastSeen: new Date() })
    .onConflictDoUpdate({
      target: [presence.agreementId, presence.userEmail],
      set: { lastSeen: new Date() },
    });
  return NextResponse.json({ ok: true });
}

// List active viewers
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const url = new URL(request.url);
  const staleMs = Number(url.searchParams.get("staleMs") || 40000);
  const cutoff = new Date(Date.now() - staleMs);
  const rows = await db
    .select()
    .from(presence)
    .where(and(eq(presence.agreementId, params.id), gte(presence.lastSeen, cutoff)));
  // Opportunistically clean old rows (no await — fire and forget)
  db.execute(sql`delete from presence where agreement_id = ${params.id} and last_seen < ${cutoff}`)
    .catch(() => {});
  return NextResponse.json(
    rows.map((r) => ({ user_email: r.userEmail, last_seen: r.lastSeen }))
  );
}

// Remove my presence on unmount
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  await db
    .delete(presence)
    .where(and(eq(presence.agreementId, params.id), eq(presence.userEmail, u.email)));
  return NextResponse.json({ ok: true });
}
