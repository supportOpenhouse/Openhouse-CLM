import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { db, agreements } from "@/lib/db-client";
import { desc } from "drizzle-orm";

export async function GET() {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const rows = await db.select().from(agreements).orderBy(desc(agreements.updatedAt));
  return NextResponse.json(rows.map(shape));
}

export async function POST(request: Request) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;

  const body = await request.json();
  const { name = "Untitled Agreement", template_id = "standard_with_loan", form = {} } = body;

  const [row] = await db
    .insert(agreements)
    .values({
      name,
      templateId: template_id,
      form,
      status: "draft",
      creator: u.id,
      creatorEmail: u.email,
      updatedBy: u.id,
      updatedByEmail: u.email,
    })
    .returning();

  return NextResponse.json(shape(row));
}

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
