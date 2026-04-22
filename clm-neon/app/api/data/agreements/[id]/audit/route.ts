import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { db, auditLog } from "@/lib/db-client";
import { eq, desc } from "drizzle-orm";

function shape(a: any) {
  return {
    id: a.id,
    agreement_id: a.agreementId,
    user_id: a.userId,
    user_email: a.userEmail,
    action: a.action,
    details: a.details,
    version_id: a.versionId,
    timestamp: a.createdAt,
    created_at: a.createdAt,
  };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 500), 2000);
  const rows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.agreementId, params.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
  return NextResponse.json(rows.map(shape));
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const body = await request.json();
  const { action, details, version_id } = body;
  if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  try {
    await db.insert(auditLog).values({
      agreementId: params.id,
      userId: u.id,
      userEmail: u.email,
      action,
      details: details || "",
      versionId: version_id || null,
    });
  } catch (e) {
    console.error("audit insert failed", e);
    // Still return ok — audit must never block user actions
  }
  return NextResponse.json({ ok: true });
}
