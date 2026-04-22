import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { db, versions } from "@/lib/db-client";
import { eq } from "drizzle-orm";

function shape(v: any) {
  return {
    id: v.id,
    agreement_id: v.agreementId,
    name: v.name,
    form: v.form,
    template_id: v.templateId,
    status: v.status,
    created_by: v.createdBy,
    created_by_email: v.createdByEmail,
    submitted_by_email: v.submittedByEmail,
    submitted_at: v.submittedAt,
    approved_by_email: v.approvedByEmail,
    approved_at: v.approvedAt,
    rejected_by_email: v.rejectedByEmail,
    rejected_at: v.rejectedAt,
    review_notes: v.reviewNotes,
    timestamp: v.createdAt,
    created_at: v.createdAt,
  };
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;

  const body = await request.json();
  const patch: any = {};

  // Renaming: anyone can rename any version
  if (body.name !== undefined) patch.name = body.name;

  // Status transitions: enforce who can do what
  if (body.status !== undefined) {
    if (!["draft", "pending_review", "approved", "rejected"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    // Only admins can approve or reject
    if ((body.status === "approved" || body.status === "rejected") && u.role !== "admin") {
      return NextResponse.json({ error: "Only admins can approve or reject" }, { status: 403 });
    }
    patch.status = body.status;
  }

  // Stamp the actor for review actions
  if (body.submitted_by_email !== undefined) {
    patch.submittedByEmail = body.submitted_by_email;
    patch.submittedAt = body.submitted_at ? new Date(body.submitted_at) : new Date();
  }
  if (body.approved_by_email !== undefined) {
    patch.approvedByEmail = body.approved_by_email;
    patch.approvedAt = body.approved_at ? new Date(body.approved_at) : new Date();
  }
  if (body.rejected_by_email !== undefined) {
    patch.rejectedByEmail = body.rejected_by_email;
    patch.rejectedAt = body.rejected_at ? new Date(body.rejected_at) : new Date();
  }
  if (body.review_notes !== undefined) patch.reviewNotes = body.review_notes;

  const [row] = await db.update(versions).set(patch).where(eq(versions.id, params.id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(shape(row));
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;

  // Check ownership: version creator or admin can delete
  const rows = await db.select().from(versions).where(eq(versions.id, params.id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const v = rows[0];
  if (v.createdBy !== u.id && u.role !== "admin") {
    return NextResponse.json({ error: "Only the creator or an admin can delete" }, { status: 403 });
  }

  await db.delete(versions).where(eq(versions.id, params.id));
  return NextResponse.json({ ok: true });
}
