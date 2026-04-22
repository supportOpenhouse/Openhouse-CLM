import { redirect, notFound } from "next/navigation";
import { createServer } from "@/lib/supabase-server";
import AgreementEditor from "@/components/AgreementEditor";

export default async function AgreementPage({ params }: { params: { id: string } }) {
  const supabase = createServer();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  // Load user profile
  const { data: userProfile } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  const user = {
    id: authUser.id,
    email: authUser.email!,
    display_name: userProfile?.display_name || null,
    role: (userProfile?.role || "editor") as "admin" | "editor",
  };

  // Load the agreement
  const { data: agreement, error } = await supabase
    .from("agreements")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !agreement) {
    notFound();
  }

  return <AgreementEditor user={user} initialAgreement={agreement} />;
}
