import { createClient } from "./supabase-browser";

type SupabaseClient = ReturnType<typeof createClient>;

// Singleton browser client to avoid re-creating on every call
let _client: SupabaseClient | null = null;
function sb() {
  if (!_client) _client = createClient();
  return _client;
}

// ============================================================================
// USERS
// ============================================================================

export async function fetchCurrentUser() {
  const {
    data: { user },
  } = await sb().auth.getUser();
  if (!user) return null;
  const { data, error } = await sb().from("users").select("*").eq("id", user.id).single();
  if (error) return { id: user.id, email: user.email!, display_name: null, role: "editor" as const };
  return data;
}

export async function fetchAllUsers() {
  const { data, error } = await sb().from("users").select("*").order("role", { ascending: true }).order("email");
  if (error) throw error;
  return data || [];
}

export async function setUserRole(userId: string, role: "admin" | "editor") {
  const { error } = await sb().from("users").update({ role }).eq("id", userId);
  if (error) throw error;
}

// ============================================================================
// AGREEMENTS
// ============================================================================

export async function fetchAgreements() {
  const { data, error } = await sb()
    .from("agreements")
    .select("id, name, template_id, status, creator_email, updated_by_email, updated_at, created_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchAgreementById(id: string) {
  const { data, error } = await sb().from("agreements").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createAgreement(args: { name: string; template_id: string; form: any; creator: string; creator_email: string }) {
  const { data, error } = await sb()
    .from("agreements")
    .insert({
      name: args.name,
      template_id: args.template_id,
      form: args.form,
      creator: args.creator,
      creator_email: args.creator_email,
      updated_by: args.creator,
      updated_by_email: args.creator_email,
      status: "draft",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAgreement(id: string, patch: { name?: string; template_id?: string; form?: any; status?: string; updated_by?: string; updated_by_email?: string }) {
  const { data, error } = await sb().from("agreements").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteAgreement(id: string) {
  const { error } = await sb().from("agreements").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================================
// VERSIONS
// ============================================================================

export async function fetchVersions(agreementId: string) {
  const { data, error } = await sb()
    .from("versions")
    .select("*")
    .eq("agreement_id", agreementId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createVersion(args: {
  agreement_id: string;
  name: string;
  form: any;
  template_id: string;
  created_by: string;
  created_by_email: string;
}) {
  const { data, error } = await sb()
    .from("versions")
    .insert({ ...args, status: "draft" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateVersion(
  id: string,
  patch: {
    name?: string;
    status?: string;
    submitted_by_email?: string;
    submitted_at?: string;
    approved_by_email?: string;
    approved_at?: string;
    rejected_by_email?: string;
    rejected_at?: string;
    review_notes?: string;
  }
) {
  const { data, error } = await sb().from("versions").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteVersion(id: string) {
  const { error } = await sb().from("versions").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================================
// AUDIT LOG
// ============================================================================

export async function appendAudit(args: {
  agreement_id: string;
  user_id: string;
  user_email: string;
  action: string;
  details: string;
  version_id?: string | null;
}) {
  const { error } = await sb().from("audit_log").insert(args);
  if (error) {
    // Swallow — audit must never block a user action
    console.error("audit_log insert failed", error);
  }
}

export async function fetchAudit(agreementId: string, limit = 500) {
  const { data, error } = await sb()
    .from("audit_log")
    .select("*")
    .eq("agreement_id", agreementId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ============================================================================
// PRESENCE
// ============================================================================

export async function heartbeatPresence(agreementId: string, email: string) {
  const { error } = await sb()
    .from("presence")
    .upsert({ agreement_id: agreementId, user_email: email, last_seen: new Date().toISOString() }, { onConflict: "agreement_id,user_email" });
  if (error) console.error("presence upsert", error);
}

export async function fetchPresence(agreementId: string, staleMs = 40000) {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const { data, error } = await sb()
    .from("presence")
    .select("user_email, last_seen")
    .eq("agreement_id", agreementId)
    .gte("last_seen", cutoff);
  if (error) return [];
  return data || [];
}

export async function removePresence(agreementId: string, email: string) {
  await sb().from("presence").delete().eq("agreement_id", agreementId).eq("user_email", email);
}
