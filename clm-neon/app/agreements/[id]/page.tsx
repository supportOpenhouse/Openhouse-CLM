import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { db, agreements, users } from "@/lib/db-client";
import { eq } from "drizzle-orm";
import AgreementEditor from "@/components/AgreementEditor";

export default async function AgreementPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const [userRow] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  const user = {
    id: session.user.id,
    email: session.user.email,
    display_name: userRow?.displayName || userRow?.name || null,
    role: (userRow?.role || "editor") as "admin" | "editor",
  };

  const rows = await db.select().from(agreements).where(eq(agreements.id, params.id)).limit(1);
  if (rows.length === 0) notFound();
  const a = rows[0];

  // Shape to match component's expected snake_case keys
  const initialAgreement = {
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

  return <AgreementEditor user={user} initialAgreement={initialAgreement} />;
}
