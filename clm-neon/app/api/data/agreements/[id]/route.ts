import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { db, agreements } from "@/lib/db-client";
import { eq } from "drizzle-orm";

function shape(a: any) {
  return {
    id: a.id,
    name: a.name,
    template_id: a.templateId,
    form: a.form,
    status: a.status,
    creator: a.creator,
    creator_email: a.creatorEmail,
    updated_by: a.updatedBy,
    updated_by_email: a.updatedByEmail,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const rows = await db.select().from(agreements).where(eq(agreements.id, params.id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(shape(rows[0]));
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;

  const body = await request.json();
  const patch: any = { updatedAt: new Date(), updatedBy: u.id, updatedByEmail: u.email };
  if (body.name !== undefined) patch.name = body.name;
  if (body.template_id !== undefined) patch.templateId = body.template_id;
  if (body.form !== undefined) patch.form = body.form;
  if (body.status !== undefined) {
    if (!["draft", "pending_review", "approved", "rejected"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = body.status;
  }

  const [row] = await db.update(agreements).set(patch).where(eq(agreements.id, params.id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(shape(row));
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  await db.delete(agreements).where(eq(agreements.id, params.id));
  return NextResponse.json({ ok: true });
}
