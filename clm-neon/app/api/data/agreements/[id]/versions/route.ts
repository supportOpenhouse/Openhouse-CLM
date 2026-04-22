import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { db, versions } from "@/lib/db-client";
import { eq, desc } from "drizzle-orm";

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

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const rows = await db
    .select()
    .from(versions)
    .where(eq(versions.agreementId, params.id))
    .orderBy(desc(versions.createdAt));
  return NextResponse.json(rows.map(shape));
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const body = await request.json();
  const { name, form, template_id } = body;
  if (!name || !form || !template_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const [row] = await db
    .insert(versions)
    .values({
      agreementId: params.id,
      name,
      form,
      templateId: template_id,
      status: "draft",
      createdBy: u.id,
      createdByEmail: u.email,
    })
    .returning();
  return NextResponse.json(shape(row));
}
