// Client-side data access. All queries go through /api/data/* routes so that
// authentication and authorization happen server-side. The interface here
// matches the previous Supabase version so React components don't need to change.

async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ============================================================================
// USERS
// ============================================================================

export async function fetchCurrentUser() {
  try {
    const data = await api("/api/data/me");
    return data;
  } catch {
    return null;
  }
}

export async function fetchAllUsers() {
  return api<any[]>("/api/data/users");
}

export async function setUserRole(userId: string, role: "admin" | "editor") {
  return api(`/api/data/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

// ============================================================================
// AGREEMENTS
// ============================================================================

export async function fetchAgreements() {
  return api<any[]>("/api/data/agreements");
}

export async function fetchAgreementById(id: string) {
  return api(`/api/data/agreements/${id}`);
}

export async function createAgreement(args: {
  name: string;
  template_id: string;
  form: any;
  creator?: string;
  creator_email?: string;
}) {
  return api("/api/data/agreements", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function updateAgreement(
  id: string,
  patch: {
    name?: string;
    template_id?: string;
    form?: any;
    status?: string;
    updated_by?: string;
    updated_by_email?: string;
  }
) {
  return api(`/api/data/agreements/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteAgreement(id: string) {
  return api(`/api/data/agreements/${id}`, { method: "DELETE" });
}

// ============================================================================
// VERSIONS
// ============================================================================

export async function fetchVersions(agreementId: string) {
  return api<any[]>(`/api/data/agreements/${agreementId}/versions`);
}

export async function createVersion(args: {
  agreement_id: string;
  name: string;
  form: any;
  template_id: string;
  created_by?: string;
  created_by_email?: string;
}) {
  return api(`/api/data/agreements/${args.agreement_id}/versions`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function updateVersion(id: string, patch: any) {
  return api(`/api/data/versions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteVersion(id: string) {
  return api(`/api/data/versions/${id}`, { method: "DELETE" });
}

// ============================================================================
// AUDIT LOG
// ============================================================================

export async function appendAudit(args: {
  agreement_id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  details: string;
  version_id?: string | null;
}) {
  try {
    await api(`/api/data/agreements/${args.agreement_id}/audit`, {
      method: "POST",
      body: JSON.stringify(args),
    });
  } catch (e) {
    // Don't block user actions on audit failures
    console.error("audit failed", e);
  }
}

export async function fetchAudit(agreementId: string, limit = 500) {
  return api<any[]>(`/api/data/agreements/${agreementId}/audit?limit=${limit}`);
}

// ============================================================================
// PRESENCE
// ============================================================================

export async function heartbeatPresence(agreementId: string) {
  try {
    await api(`/api/data/agreements/${agreementId}/presence`, { method: "POST" });
  } catch {}
}

export async function fetchPresence(agreementId: string, staleMs = 40000) {
  try {
    return await api<{ user_email: string; last_seen: string }[]>(
      `/api/data/agreements/${agreementId}/presence?staleMs=${staleMs}`
    );
  } catch {
    return [];
  }
}

export async function removePresence(agreementId: string) {
  try {
    await api(`/api/data/agreements/${agreementId}/presence`, { method: "DELETE" });
  } catch {}
}
