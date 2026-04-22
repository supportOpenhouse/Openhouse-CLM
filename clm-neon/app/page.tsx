"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserBadge from "@/components/UserBadge";
import TeamSettingsModal from "@/components/TeamSettingsModal";
import { fetchCurrentUser, fetchAgreements, createAgreement, appendAudit } from "@/lib/db";
import { BLANK_FORM, TEMPLATES, relativeTime } from "@/lib/contract";
import { signOut } from "next-auth/react";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showSettings, setShowSettings] = useState(false);

  async function refresh() {
    try {
      const u = await fetchCurrentUser();
      if (!u) { router.push("/login"); return; }
      setUser(u);
      const list = await fetchAgreements();
      setAgreements(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleNew() {
    if (!user) return;
    try {
      const a = await createAgreement({
        name: "New Agreement",
        template_id: "standard_with_loan",
        form: BLANK_FORM,
        creator: user.id,
        creator_email: user.email,
      });
      await appendAudit({
        agreement_id: a.id,
        user_id: user.id,
        user_email: user.email,
        action: "created",
        details: "Agreement created",
      });
      router.push(`/agreements/${a.id}`);
    } catch (e: any) {
      alert("Failed to create agreement: " + e.message);
    }
  }

  async function handleSignOut() {
    await signOut({ callbackUrl: "/login" });
  }

  const filtered = agreements.filter((a) => {
    if (statusFilter !== "all" && (a.status || "draft") !== statusFilter) return false;
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    return (
      (a.name || "").toLowerCase().includes(q) ||
      (a.id || "").toLowerCase().includes(q) ||
      (a.creator_email || "").toLowerCase().includes(q)
    );
  });

  if (loading || !user) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f1e8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" />
      </div>
    );
  }

  const isAdmin = user.role === "admin";

  return (
    <div className="clm-app">
      <header className="clm-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="logo-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 12l9-9 9 9" />
              <path d="M5 10v10h14V10" />
              <path d="M10 20v-6h4v6" />
            </svg>
          </div>
          <div>
            <div className="brand-title">Openhouse CLM</div>
            <div className="brand-subtitle">Asset Management Agreements · Shared Workspace</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={handleNew} className="btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Agreement
          </button>
          <UserBadge
            user={user}
            isAdmin={isAdmin}
            onSignOut={handleSignOut}
            onOpenSettings={() => setShowSettings(true)}
          />
        </div>
      </header>

      <div className="list-wrap">
        <div className="list-toolbar">
          <input
            type="text"
            className="list-search"
            placeholder="Search by project, AMA code, or creator…"
            value={filter}
            onChange={(ev) => setFilter(ev.target.value)}
          />
          <div className="list-status-filter">
            {["all", "draft", "pending_review", "approved"].map((s) => (
              <button
                key={s}
                className={`filter-chip ${statusFilter === s ? "filter-chip-active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "All" : s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="list-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "#a8a29e", margin: "0 auto 12px", display: "block" }}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#44403c" }}>
              {agreements.length === 0 ? "No agreements yet" : "No matches"}
            </div>
            <div style={{ fontSize: 12, color: "#78716c", marginTop: 4 }}>
              {agreements.length === 0 ? "Start your first AMA — it'll be visible to everyone on the team." : "Try a different search."}
            </div>
            {agreements.length === 0 && (
              <button onClick={handleNew} className="btn-primary" style={{ marginTop: 16 }}>
                Create first agreement
              </button>
            )}
          </div>
        ) : (
          <div className="ag-grid">
            {filtered.map((a) => (
              <button key={a.id} className="ag-card" onClick={() => router.push(`/agreements/${a.id}`)}>
                <div className="ag-card-title">{a.name || "Untitled Agreement"}</div>
                <div className="ag-status-row">
                  <span className={`status-chip chip-${a.status || "draft"}`}>
                    {(a.status || "draft").replace("_", " ")}
                  </span>
                </div>
                <div className="ag-card-meta">
                  <div><strong>Template:</strong> {TEMPLATES[a.template_id]?.name || a.template_id}</div>
                  <div><strong>Created by:</strong> {a.creator_email || "—"}</div>
                  <div><strong>Last edit:</strong> {a.updated_by_email || "—"} · {relativeTime(a.updated_at)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showSettings && <TeamSettingsModal user={user} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
