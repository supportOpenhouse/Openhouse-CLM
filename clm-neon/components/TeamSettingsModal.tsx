"use client";

import { useEffect, useState } from "react";
import { avatarColor, initialsOf, relativeTime } from "@/lib/contract";
import { fetchAllUsers, setUserRole } from "@/lib/db";

export default function TeamSettingsModal({
  user,
  onClose,
}: {
  user: { email: string };
  onClose: () => void;
}) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const list = await fetchAllUsers();
      setUsers(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function changeRole(userId: string, newRole: "admin" | "editor") {
    const hasOtherAdmin = users.some((u) => u.id !== userId && u.role === "admin");
    const targetIsLastAdmin = users.find((u) => u.id === userId)?.role === "admin" && !hasOtherAdmin;
    if (targetIsLastAdmin && newRole !== "admin") {
      alert("There must be at least one admin.");
      return;
    }
    setSaving(true);
    try {
      await setUserRole(userId, newRole);
      await refresh();
    } catch (e: any) {
      alert("Failed to update role: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Team & Roles</div>
            <div className="modal-subtitle">Promote teammates to admin — admins approve versions.</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {loading ? (
          <div style={{ padding: 32 }}>
            <div className="spinner" />
          </div>
        ) : (
          <div className="team-list">
            {users.length === 0 ? (
              <div style={{ padding: 24, fontSize: 13, color: "#57534e" }}>
                No users yet — they'll appear here once they sign in.
              </div>
            ) : (
              users.map((u) => (
                <div key={u.id} className="team-row">
                  <div className="team-avatar" style={{ background: avatarColor(u.email) }}>
                    {initialsOf(u)}
                  </div>
                  <div className="team-info">
                    <div className="team-name">
                      {u.display_name || u.email}
                      {u.email === user.email && <span className="team-you">you</span>}
                    </div>
                    <div className="team-email">{u.email}</div>
                    <div className="team-meta">
                      Joined {relativeTime(u.first_login)} · Last seen {relativeTime(u.last_login)}
                    </div>
                  </div>
                  <div className="team-role">
                    <select
                      value={u.role}
                      disabled={saving}
                      onChange={(ev) => changeRole(u.id, ev.target.value as any)}
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                    </select>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        <div className="modal-footer">
          <div style={{ fontSize: 11, color: "#78716c" }}>
            Admins can approve or reject any version submitted for review.
          </div>
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
