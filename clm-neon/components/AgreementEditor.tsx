"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ContractPreview from "./ContractPreview";
import EditPopover, { type EditingState } from "./EditPopover";
import UserBadge from "./UserBadge";
import TeamSettingsModal from "./TeamSettingsModal";
import {
  TEMPLATES, BLANK_FORM, buildContractModel, applyPatch, getByPath,
  avatarColor, initialsOf, relativeTime, formatINR, toWordsIndian,
  formatAuditValue, stripTokens,
} from "@/lib/contract";
import { metaForPath, auditActionLabel } from "@/lib/path-meta";
import {
  fetchAgreementById, updateAgreement,
  fetchVersions, createVersion, updateVersion, deleteVersion as dbDeleteVersion,
  appendAudit, fetchAudit,
  heartbeatPresence, fetchPresence, removePresence,
} from "@/lib/db";
import { signOut } from "next-auth/react";

const POLL_MS = 3500;
const PRESENCE_MS = 12000;
const PRESENCE_STALE_MS = 40000;
const SAVE_DEBOUNCE_MS = 900;

type User = { id: string; email: string; display_name?: string | null; role: "admin" | "editor" };

export default function AgreementEditor({
  user,
  initialAgreement,
}: {
  user: User;
  initialAgreement: any;
}) {
  const router = useRouter();
  const isAdmin = user.role === "admin";

  const [agreement, setAgreement] = useState(initialAgreement);
  const [formData, setFormData] = useState<any>(initialAgreement.form || BLANK_FORM);
  const [templateId, setTemplateId] = useState<string>(initialAgreement.template_id || "standard_with_loan");
  const [agreementName, setAgreementName] = useState<string>(initialAgreement.name || "Untitled Agreement");
  const [status, setStatus] = useState<string>(initialAgreement.status || "draft");
  const [versions, setVersions] = useState<any[]>([]);
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [presenceList, setPresenceList] = useState<{ user_email: string; last_seen: string }[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<number>(Date.now());

  const [tab, setTab] = useState<"form" | "chat" | "upload" | "versions" | "audit">("form");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([
    { role: "assistant", content: "Hi! I can update any field in the agreement. Try: \"set base price to 1.2 cr\" or \"change owner 1 to Vikram Singh\". All edits sync with your team." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ kind: "info" | "success" | "error"; text: string } | null>(null);
  const [notification, setNotification] = useState<{ msg: string; kind: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [recentChanges, setRecentChanges] = useState<Map<string, number>>(new Map());

  const [showSaveVersionUI, setShowSaveVersionUI] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [reviewNoteFor, setReviewNoteFor] = useState<string | null>(null);
  const [reviewNoteText, setReviewNoteText] = useState("");
  const [reviewNoteAction, setReviewNoteAction] = useState<"approve" | "reject" | null>(null);

  const [showTeamSettings, setShowTeamSettings] = useState(false);

  const saveTimer = useRef<any>(null);
  const lastLocalWriteRef = useRef<number>(Date.now());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const template = TEMPLATES[templateId];
  const contractModel = useMemo(() => buildContractModel(formData, templateId), [formData, templateId]);

  function notify(msg: string, kind: "success" | "error" = "success") {
    setNotification({ msg, kind });
    setTimeout(() => setNotification(null), 3000);
  }

  function markChanged(paths: string[]) {
    if (!paths || paths.length === 0) return;
    const now = Date.now();
    setRecentChanges((prev) => {
      const next = new Map(prev);
      paths.forEach((p) => next.set(p, now));
      return next;
    });
    paths.forEach((p) => {
      setTimeout(() => {
        setRecentChanges((prev) => {
          if (prev.get(p) !== now) return prev;
          const next = new Map(prev);
          next.delete(p);
          return next;
        });
      }, 6000);
    });
  }

  function clearAllChanges() {
    setRecentChanges(new Map());
  }

  // ============ PERSISTENCE ============
  function scheduleSave() {
    lastLocalWriteRef.current = Date.now();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!mounted.current) return;
      setSyncing(true);
      try {
        await updateAgreement(agreement.id, {
          form: formData,
          template_id: templateId,
          updated_by: user.id,
          updated_by_email: user.email,
        });
        setLastSynced(Date.now());
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted.current) setSyncing(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  async function persistNow(patch: any) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    lastLocalWriteRef.current = Date.now();
    setSyncing(true);
    try {
      const updated = await updateAgreement(agreement.id, {
        ...patch,
        updated_by: user.id,
        updated_by_email: user.email,
      });
      setAgreement(updated);
      setLastSynced(Date.now());
      return updated;
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }

  async function logAudit(action: string, details: string, versionId?: string) {
    await appendAudit({
      agreement_id: agreement.id,
      user_id: user.id,
      user_email: user.email,
      action,
      details,
      version_id: versionId || null,
    });
  }

  // ============ POLLING: refresh remote data ============
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (Date.now() - lastLocalWriteRef.current < 1500) return;
      try {
        const [remote, remoteVersions] = await Promise.all([
          fetchAgreementById(agreement.id),
          fetchVersions(agreement.id),
        ]);
        if (cancelled || !remote) return;
        const remoteUpdated = new Date(remote.updated_at).getTime();
        if (remoteUpdated > lastSynced - 500 && remote.updated_by_email !== user.email) {
          setFormData(remote.form);
          setTemplateId(remote.template_id);
          setAgreementName(remote.name);
          setStatus(remote.status);
          setAgreement(remote);
          setLastSynced(Date.now());
        }
        setVersions(remoteVersions);
        if (tab === "audit") {
          const audit = await fetchAudit(agreement.id);
          if (!cancelled) setAuditEntries(audit);
        }
      } catch (e) {
        console.error("poll", e);
      }
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreement.id, tab]);

  // Initial versions fetch
  useEffect(() => {
    fetchVersions(agreement.id).then(setVersions).catch(console.error);
  }, [agreement.id]);

  // ============ PRESENCE ============
  useEffect(() => {
    let cancelled = false;
    async function beat() {
      if (cancelled) return;
      await heartbeatPresence(agreement.id);
      const list = await fetchPresence(agreement.id, PRESENCE_STALE_MS);
      if (!cancelled) setPresenceList(list);
    }
    beat();
    const t = setInterval(beat, PRESENCE_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
      removePresence(agreement.id).catch(() => {});
    };
  }, [agreement.id, user.email]);

  // ============ AUDIT LOAD ON TAB ============
  useEffect(() => {
    if (tab !== "audit") return;
    fetchAudit(agreement.id).then(setAuditEntries).catch(console.error);
  }, [tab, agreement.id]);

  // ============ FORM UPDATE ============
  function update(path: string, value: any) {
    const oldValue = getByPath(formData, path);
    setFormData((prev: any) => applyPatch(prev, { [path]: value }));
    markChanged([path]);
    scheduleSave();
    logAudit(
      "field_edit",
      `${metaForPath(path).label || path}: ${formatAuditValue(oldValue)} → ${formatAuditValue(value)}`
    );
  }

  function applyUpdates(updates: Record<string, any>) {
    const auditables = Object.entries(updates).filter(([k]) => k !== "templateId");
    setFormData((prev: any) => applyPatch(prev, updates));
    if (updates.templateId) setTemplateId(updates.templateId);
    markChanged(Object.keys(updates).filter((k) => k !== "templateId"));
    scheduleSave();
    if (auditables.length > 0) {
      logAudit(
        "bulk_update",
        `${auditables.length} field${auditables.length === 1 ? "" : "s"} updated: ${auditables.map(([k]) => metaForPath(k).label || k).slice(0, 5).join(", ")}${auditables.length > 5 ? "…" : ""}`
      );
    }
    if (updates.templateId) {
      logAudit("template_change", `Template changed to "${TEMPLATES[updates.templateId]?.name || updates.templateId}"`);
    }
  }

  async function changeTemplate(newId: string) {
    const old = templateId;
    setTemplateId(newId);
    await persistNow({ template_id: newId });
    logAudit("template_change", `Template changed from "${TEMPLATES[old]?.name || old}" to "${TEMPLATES[newId]?.name || newId}"`);
  }

  async function renameAgreement(newName: string) {
    if (!newName || newName === agreementName) return;
    const old = agreementName;
    setAgreementName(newName);
    await persistNow({ name: newName });
    logAudit("rename_agreement", `Renamed: "${old}" → "${newName}"`);
  }

  // ============ INLINE EDIT ============
  function handleEditRequest(path: string, target: HTMLElement) {
    const meta = metaForPath(path);
    const rect = target.getBoundingClientRect();
    const rawValue = getByPath(formData, path);
    const belowY = rect.bottom + 6;
    const approxPopHeight = meta.multiline ? 140 : 110;
    const y =
      belowY + approxPopHeight > window.innerHeight - 12
        ? Math.max(12, rect.top - approxPopHeight - 6)
        : belowY;
    setEditing({
      path,
      rawValue,
      label: meta.label || path,
      hint: meta.hint,
      isNumber: meta.isNumber || typeof rawValue === "number",
      multiline: meta.multiline,
      options: meta.options,
      position: { x: rect.left, y },
    });
  }

  function handleEditSave(newValue: any) {
    if (!editing) return;
    update(editing.path, newValue);
    setEditing(null);
  }

  // ============ OWNERS ============
  function addOwner() {
    if (formData.owners.length >= 3) return;
    setFormData((p: any) => ({
      ...p,
      owners: [...p.owners, { salutation: "Mr.", name: "", relation: "son", relativeSalutation: "Mr.", relativeName: "", pan: "", aadhar: "" }],
    }));
    scheduleSave();
  }

  function removeOwner(i: number) {
    if (formData.owners.length <= 1) return;
    setFormData((p: any) => ({ ...p, owners: p.owners.filter((_: any, idx: number) => idx !== i) }));
    scheduleSave();
  }

  // ============ VERSIONS ============
  function openSaveVersion() {
    const def = `${formData.meta.agreementCode || "Draft"} · ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;
    setNewVersionName(def);
    setShowSaveVersionUI(true);
  }

  async function saveVersion() {
    const name = newVersionName.trim() || `Version ${versions.length + 1}`;
    try {
      const v = await createVersion({
        agreement_id: agreement.id,
        name,
        form: formData,
        template_id: templateId,
        created_by: user.id,
        created_by_email: user.email,
      });
      setVersions((prev) => [v, ...prev]);
      setShowSaveVersionUI(false);
      setNewVersionName("");
      await logAudit("version_saved", `Saved version "${name}"`, v.id);
      notify(`Saved: ${name}`);
    } catch (e: any) {
      notify("Failed to save version: " + e.message, "error");
    }
  }

  async function restoreVersion(id: string) {
    const v = versions.find((x) => x.id === id);
    if (!v) return;
    setFormData(v.form);
    setTemplateId(v.template_id);
    clearAllChanges();
    await persistNow({ form: v.form, template_id: v.template_id });
    await logAudit("version_restored", `Restored version "${v.name}"`, v.id);
    notify(`Restored: ${v.name}`);
  }

  async function handleDeleteVersion(id: string) {
    if (confirmDeleteId === id) {
      const v = versions.find((x) => x.id === id);
      try {
        await dbDeleteVersion(id);
        setVersions((prev) => prev.filter((x) => x.id !== id));
        setConfirmDeleteId(null);
        await logAudit("version_deleted", `Deleted version "${v?.name || id}"`);
        notify("Version deleted");
      } catch (e: any) {
        notify("Failed to delete: " + e.message, "error");
      }
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId((cur) => (cur === id ? null : cur)), 4000);
    }
  }

  function startRename(v: any) {
    setRenamingId(v.id);
    setRenameValue(v.name);
  }

  async function commitRename() {
    if (!renamingId) return;
    const v = versions.find((x) => x.id === renamingId);
    const newName = renameValue.trim() || v?.name || "Version";
    if (newName !== v?.name) {
      try {
        const updated = await updateVersion(renamingId, { name: newName });
        setVersions((prev) => prev.map((x) => (x.id === renamingId ? updated : x)));
        await logAudit("version_renamed", `Renamed version "${v!.name}" → "${newName}"`, renamingId);
      } catch (e: any) {
        notify("Failed to rename: " + e.message, "error");
      }
    }
    setRenamingId(null);
    setRenameValue("");
  }

  async function submitVersionForReview(id: string) {
    const v = versions.find((x) => x.id === id);
    if (!v) return;
    try {
      const updated = await updateVersion(id, {
        status: "pending_review",
        submitted_by_email: user.email,
        submitted_at: new Date().toISOString(),
      });
      setVersions((prev) => prev.map((x) => (x.id === id ? updated : x)));
      if (status !== "approved") {
        await persistNow({ status: "pending_review" });
        setStatus("pending_review");
      }
      await logAudit("submit_review", `Submitted "${v.name}" for admin approval`, id);

      // Fire-and-forget notification
      fetch("/api/notifications/review-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreementId: agreement.id,
          agreementName,
          versionId: id,
          versionName: v.name,
          submittedBy: user.email,
        }),
      }).catch(() => {});

      notify("Submitted for admin approval");
    } catch (e: any) {
      notify("Failed to submit: " + e.message, "error");
    }
  }

  function openReviewNote(id: string, action: "approve" | "reject") {
    setReviewNoteFor(id);
    setReviewNoteAction(action);
    setReviewNoteText("");
  }

  function cancelReviewNote() {
    setReviewNoteFor(null);
    setReviewNoteAction(null);
    setReviewNoteText("");
  }

  async function commitReviewDecision() {
    if (!reviewNoteFor || !reviewNoteAction) return;
    const id = reviewNoteFor;
    const action = reviewNoteAction;
    const note = reviewNoteText.trim();
    const now = new Date().toISOString();
    const patch: any = action === "approve"
      ? { status: "approved", approved_by_email: user.email, approved_at: now, review_notes: note || undefined }
      : { status: "rejected", rejected_by_email: user.email, rejected_at: now, review_notes: note };
    try {
      const updated = await updateVersion(id, patch);
      setVersions((prev) => prev.map((x) => (x.id === id ? updated : x)));
      if (action === "approve") {
        await persistNow({ status: "approved" });
        setStatus("approved");
      }
      await logAudit(
        action === "approve" ? "approve" : "reject",
        action === "approve"
          ? `Approved version "${updated.name}"${note ? ` — ${note}` : ""}`
          : `Rejected version "${updated.name}"${note ? ` — ${note}` : ""}`,
        id
      );
      notify(action === "approve" ? "Version approved ✓" : "Version rejected");
      cancelReviewNote();
    } catch (e: any) {
      notify("Failed: " + e.message, "error");
    }
  }

  // ============ CHAT ============
  async function handleSendChat() {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    const nextMsgs = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(nextMsgs);
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, formData, templateId, history: chatMessages }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Request failed");
      const result = await res.json();
      if (result.updates && Object.keys(result.updates).length > 0) {
        applyUpdates(result.updates);
      }
      setChatMessages([...nextMsgs, { role: "assistant", content: result.reply || "Done." }]);
    } catch (e: any) {
      setChatMessages([...nextMsgs, { role: "assistant", content: "Sorry, I hit an error: " + e.message }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    setUploadMsg({ kind: "info", text: `Reading ${file.name}…` });
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve((r.result as string).split(",")[1]);
        r.onerror = () => reject(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mediaType: file.type }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Extraction failed");
      const extracted = await res.json();
      const merged = mergeExtracted(formData, extracted);
      const changed = diffPaths(formData, merged);
      setFormData(merged);
      setTimeout(() => markChanged(changed), 0);
      scheduleSave();
      await logAudit("bulk_update", `Populated ${changed.length} fields from uploaded document`);
      setUploadMsg({ kind: "success", text: `Extracted fields from ${file.name}. Review and edit as needed.` });
      notify("Document parsed — fields populated");
    } catch (err: any) {
      setUploadMsg({ kind: "error", text: "Failed to parse: " + err.message });
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ============ EXPORTS ============
  async function handleDownloadPDF() {
    try {
      notify("Generating PDF…");
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId: agreement.id, form: formData, templateId, name: agreementName }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const code = formData.meta.agreementCode || "AMA";
      a.download = `${code}_${(formData.meta.projectCode || "Agreement").replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      notify("PDF downloaded");
    } catch (e: any) {
      notify("PDF failed: " + e.message, "error");
    }
  }

  function handleCopyText() {
    const text = generatePlainText(contractModel);
    navigator.clipboard.writeText(text);
    notify("Contract text copied");
  }

  async function handleSignOut() {
    await signOut({ callbackUrl: "/login" });
  }

  function formatVersionTime(iso: string) {
    try {
      return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  }

  const othersPresent = presenceList
    .filter((p) => p.user_email !== user.email && Date.now() - new Date(p.last_seen).getTime() < PRESENCE_STALE_MS)
    .map((p) => p.user_email);

  return (
    <div className="clm-app">
      {notification && <div className={`notification ${notification.kind}`}>{notification.msg}</div>}

      <header className="clm-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="back-btn" onClick={() => router.push("/")} title="Back to agreements">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div className="logo-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 12l9-9 9 9" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" />
            </svg>
          </div>
          <div>
            <input
              className="brand-title-editable"
              value={agreementName}
              onChange={(ev) => setAgreementName(ev.target.value)}
              onBlur={(ev) => renameAgreement(ev.target.value.trim() || "Untitled Agreement")}
              onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
              title="Click to rename"
            />
            <div className="brand-subtitle">
              <span className={`status-chip chip-${status}`}>{(status || "draft").replace("_", " ")}</span>
              <span className="sync-indicator">
                {syncing ? (
                  <><span className="sync-dot sync-dot-active" /> Syncing…</>
                ) : (
                  <><span className="sync-dot" /> Synced {relativeTime(new Date(lastSynced).toISOString())}</>
                )}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {othersPresent.length > 0 && (
            <div className="presence-dots" title={`${othersPresent.length} other ${othersPresent.length === 1 ? "person" : "people"} viewing`}>
              {othersPresent.slice(0, 4).map((email) => (
                <span key={email} className="presence-dot" style={{ background: avatarColor(email) }} title={email}>
                  {initialsOf({ email })}
                </span>
              ))}
              {othersPresent.length > 4 && <span className="presence-dot presence-overflow">+{othersPresent.length - 4}</span>}
            </div>
          )}
          <select
            value={templateId}
            onChange={(ev) => changeTemplate(ev.target.value)}
            className="template-picker"
            title="Select template from knowledge base"
          >
            {Object.values(TEMPLATES).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button onClick={handleCopyText} className="btn-ghost" title="Copy plain text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15V5a2 2 0 012-2h10" />
            </svg>
          </button>
          <div className="save-version-wrapper">
            <button
              onClick={() => showSaveVersionUI ? setShowSaveVersionUI(false) : openSaveVersion()}
              className="btn-ghost"
              title="Save version"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            </button>
            {showSaveVersionUI && (
              <div className="version-save-popover">
                <div className="edit-popover-label">Save current draft as a version</div>
                <input
                  type="text"
                  value={newVersionName}
                  onChange={(ev) => setNewVersionName(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") saveVersion();
                    if (ev.key === "Escape") setShowSaveVersionUI(false);
                  }}
                  autoFocus
                  placeholder="e.g. Pre-signing draft"
                />
                <div className="edit-popover-actions">
                  <button className="edit-popover-cancel" onClick={() => setShowSaveVersionUI(false)}>Cancel</button>
                  <button className="edit-popover-save" onClick={saveVersion}>Save version</button>
                </div>
              </div>
            )}
          </div>
          <button onClick={handleDownloadPDF} className="btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download PDF</span>
          </button>
          <UserBadge
            user={user}
            isAdmin={isAdmin}
            onSignOut={handleSignOut}
            onOpenSettings={() => setShowTeamSettings(true)}
          />
        </div>
      </header>

      <div className="template-info">
        <div style={{ fontSize: 11, color: "#78716c" }}>
          <strong style={{ color: "#92400e" }}>{template.name}</strong> — {template.description}
        </div>
      </div>

      <main className="clm-main">
        <div className="left-panel">
          <div className="tab-bar">
            <button onClick={() => setTab("form")} className={`tab ${tab === "form" ? "tab-active" : ""}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Form
            </button>
            <button onClick={() => setTab("chat")} className={`tab ${tab === "chat" ? "tab-active" : ""}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              AI
            </button>
            <button onClick={() => setTab("upload")} className={`tab ${tab === "upload" ? "tab-active" : ""}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload
            </button>
            <button onClick={() => setTab("versions")} className={`tab ${tab === "versions" ? "tab-active" : ""}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Versions
              {versions.length > 0 && <span className="tab-badge">{versions.length}</span>}
            </button>
            <button onClick={() => setTab("audit")} className={`tab ${tab === "audit" ? "tab-active" : ""}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Activity
            </button>
          </div>

          <div className="panel-content">
            {tab === "form" && <FormTab formData={formData} update={update} template={template} addOwner={addOwner} removeOwner={removeOwner} />}

            {tab === "chat" && (
              <div className="chat-tab">
                <div className="chat-messages">
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`msg msg-${m.role}`}>
                      <div className="msg-bubble">{m.content}</div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="msg msg-assistant">
                      <div className="msg-bubble">
                        <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="chat-input-row">
                  <textarea
                    value={chatInput}
                    onChange={(ev) => setChatInput(ev.target.value)}
                    onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); handleSendChat(); } }}
                    placeholder="Tell the assistant what to change…"
                    rows={2}
                    className="chat-textarea"
                  />
                  <button onClick={handleSendChat} disabled={!chatInput.trim() || chatLoading} className="chat-send-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
                <div className="chat-suggestions">
                  {["Set base price to 1.25 cr", "Security deposit to 1%", "Switch to no-loan template", "Summarize this agreement"].map((s) => (
                    <button key={s} onClick={() => setChatInput(s)} className="suggestion-chip">{s}</button>
                  ))}
                </div>
              </div>
            )}

            {tab === "upload" && (
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "#78716c", fontWeight: 600, marginBottom: 12 }}>
                  Upload a Document
                </div>
                <p style={{ fontSize: 13, color: "#57534e", marginBottom: 16 }}>
                  Drop a past AMA, conveyance deed, or related PDF/image. AI extracts every field it can recognise.
                </p>
                <div className="upload-dropzone" onClick={() => fileInputRef.current?.click()}>
                  {uploadLoading ? (
                    <>
                      <div className="spinner" />
                      <div style={{ fontSize: 13, color: "#57534e", marginTop: 12 }}>Reading document — this usually takes 10-20s…</div>
                    </>
                  ) : (
                    <>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "#a8a29e", margin: "0 auto 12px", display: "block" }}>
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#44403c" }}>Click to upload a PDF or image</div>
                      <div style={{ fontSize: 11, color: "#78716c", marginTop: 4 }}>PDF · PNG · JPG — up to 20 MB</div>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                {uploadMsg && <div className={`upload-msg upload-msg-${uploadMsg.kind}`}>{uploadMsg.text}</div>}
              </div>
            )}

            {tab === "versions" && (
              <div className="versions-tab">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "#78716c", fontWeight: 600 }}>
                    Saved Versions
                  </div>
                  <button onClick={openSaveVersion} className="btn-save-version">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save current
                  </button>
                </div>
                <p style={{ fontSize: 12, color: "#57534e", marginBottom: 16, lineHeight: 1.6 }}>
                  Submit a version for review — an admin will approve or reject it.
                </p>
                {versions.length === 0 ? (
                  <div className="versions-empty">
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#44403c" }}>No versions yet</div>
                    <div style={{ fontSize: 11, color: "#78716c", marginTop: 4 }}>Save a version before making big changes.</div>
                  </div>
                ) : (
                  <div className="versions-list">
                    {versions.map((v) => (
                      <div key={v.id} className={`version-item version-status-${v.status || "draft"}`}>
                        <div className="version-header">
                          {renamingId === v.id ? (
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(ev) => setRenameValue(ev.target.value)}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter") commitRename();
                                if (ev.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                              }}
                              onBlur={commitRename}
                              autoFocus
                              className="version-name-input"
                            />
                          ) : (
                            <div className="version-name" onDoubleClick={() => startRename(v)}>{v.name}</div>
                          )}
                          <span className={`status-chip chip-${v.status || "draft"}`}>
                            {(v.status || "draft").replace("_", " ")}
                          </span>
                        </div>
                        <div className="version-meta-row">
                          <span className="version-author-avatar" style={{ background: avatarColor(v.created_by_email) }}>
                            {initialsOf({ email: v.created_by_email })}
                          </span>
                          <span>Saved by {v.created_by_email || "unknown"} · {formatVersionTime(v.created_at)}</span>
                        </div>
                        <div className="version-meta-row subtle">Template: {TEMPLATES[v.template_id]?.name || v.template_id}</div>
                        {v.status === "pending_review" && v.submitted_by_email && (
                          <div className="version-meta-row subtle">Submitted by {v.submitted_by_email} · {relativeTime(v.submitted_at)}</div>
                        )}
                        {v.status === "approved" && v.approved_by_email && (
                          <div className="version-meta-row approved-meta">✓ Approved by {v.approved_by_email} · {relativeTime(v.approved_at)}</div>
                        )}
                        {v.status === "rejected" && v.rejected_by_email && (
                          <div className="version-meta-row rejected-meta">✗ Rejected by {v.rejected_by_email} · {relativeTime(v.rejected_at)}</div>
                        )}
                        {v.review_notes && <div className="version-notes">"{v.review_notes}"</div>}

                        {reviewNoteFor === v.id ? (
                          <div className="review-note-box">
                            <div className="edit-popover-label">
                              {reviewNoteAction === "approve" ? "Add an approval note (optional)" : "Reason for rejection (optional)"}
                            </div>
                            <textarea
                              rows={2}
                              value={reviewNoteText}
                              onChange={(ev) => setReviewNoteText(ev.target.value)}
                              placeholder={reviewNoteAction === "approve" ? "e.g. Verified with legal, good to sign" : "e.g. Base price doesn't match receipt"}
                              autoFocus
                            />
                            <div className="edit-popover-actions">
                              <button className="edit-popover-cancel" onClick={cancelReviewNote}>Cancel</button>
                              <button
                                className={reviewNoteAction === "approve" ? "btn-approve-commit" : "btn-reject-commit"}
                                onClick={commitReviewDecision}
                              >
                                {reviewNoteAction === "approve" ? "Confirm approval" : "Confirm rejection"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="version-actions">
                            <button className="version-btn" onClick={() => restoreVersion(v.id)}>Restore</button>
                            {v.status === "draft" && v.created_by_email === user.email && (
                              <button className="version-btn version-btn-submit" onClick={() => submitVersionForReview(v.id)}>
                                Submit for review
                              </button>
                            )}
                            {v.status === "pending_review" && isAdmin && (
                              <>
                                <button className="version-btn version-btn-approve" onClick={() => openReviewNote(v.id, "approve")}>Approve ✓</button>
                                <button className="version-btn version-btn-reject" onClick={() => openReviewNote(v.id, "reject")}>Reject</button>
                              </>
                            )}
                            {v.status === "pending_review" && !isAdmin && (
                              <span className="version-pending-hint">Awaiting admin approval</span>
                            )}
                            <button className="version-btn" onClick={() => startRename(v)}>Rename</button>
                            {(v.status === "draft" || v.created_by_email === user.email || isAdmin) && (
                              <button
                                className={`version-btn version-btn-danger${confirmDeleteId === v.id ? " confirming" : ""}`}
                                onClick={() => handleDeleteVersion(v.id)}
                              >
                                {confirmDeleteId === v.id ? "Tap again to delete" : "Delete"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "audit" && (
              <div className="audit-tab">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "#78716c", fontWeight: 600 }}>
                    Activity Log
                  </div>
                  <span style={{ fontSize: 10, color: "#78716c" }}>
                    {auditEntries.length} {auditEntries.length === 1 ? "entry" : "entries"}
                  </span>
                </div>
                {auditEntries.length === 0 ? (
                  <div className="versions-empty">
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#44403c" }}>No activity yet</div>
                  </div>
                ) : (
                  <div className="audit-list">
                    {auditEntries.map((a) => (
                      <div key={a.id} className={`audit-item audit-${a.action}`}>
                        <div className="audit-avatar" style={{ background: avatarColor(a.user_email) }}>
                          {initialsOf({ email: a.user_email })}
                        </div>
                        <div className="audit-body">
                          <div className="audit-top">
                            <span className="audit-user">{a.user_email}</span>
                            <span className="audit-action-label">{auditActionLabel(a.action)}</span>
                            <span className="audit-time">{relativeTime(a.created_at)}</span>
                          </div>
                          <div className="audit-details">{a.details}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="right-panel">
          <ContractPreview
            model={contractModel}
            template={template}
            agreementCode={formData.meta.agreementCode}
            projectCode={formData.meta.projectCode}
            owners={formData.owners}
            recentChanges={recentChanges}
            onEditRequest={handleEditRequest}
            editingPath={editing?.path}
          />
        </div>
      </main>

      <EditPopover editing={editing} onCancel={() => setEditing(null)} onSave={handleEditSave} />
      {showTeamSettings && <TeamSettingsModal user={user} onClose={() => setShowTeamSettings(false)} />}
    </div>
  );
}

// ============================================================================
// FORM TAB (left panel inputs)
// ============================================================================
function FormTab({ formData, update, template, addOwner, removeOwner }: any) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "#78716c", fontWeight: 600, marginBottom: 12 }}>
        Agreement Inputs
      </div>

      <Section title="Agreement Details">
        <Grid2>
          <Field label="AMA Code" value={formData.meta.agreementCode} onChange={(v: any) => update("meta.agreementCode", v)} />
          <Field label="Project Code / Name" value={formData.meta.projectCode} onChange={(v: any) => update("meta.projectCode", v)} />
        </Grid2>
        <Grid2>
          <Field label="Execution Location" value={formData.meta.location} onChange={(v: any) => update("meta.location", v)} />
          <Field label="Agreement Date" value={formData.meta.agreementDate} onChange={(v: any) => update("meta.agreementDate", v)} placeholder="DD/MM/YYYY" />
        </Grid2>
      </Section>

      <Section title="Owner(s)" badge={String(formData.owners.length)}>
        {formData.owners.map((o: any, i: number) => (
          <div key={i} style={{ border: "1px solid #e7e0d0", borderRadius: 6, padding: 12, marginBottom: 8, background: "rgba(245, 241, 232, 0.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#44403c" }}>Owner {i + 1}</span>
              {formData.owners.length > 1 && (
                <button onClick={() => removeOwner(i)} style={{ fontSize: 10, color: "#991b1b", background: "none", border: "none", cursor: "pointer" }}>
                  Remove
                </button>
              )}
            </div>
            <Grid3>
              <Select label="Salutation" value={o.salutation} onChange={(v: any) => update(`owners[${i}].salutation`, v)} options={[{ value: "Mr.", label: "Mr." }, { value: "Mrs.", label: "Mrs." }, { value: "Ms.", label: "Ms." }]} />
              <div style={{ gridColumn: "span 2" }}>
                <Field label="Full Name" value={o.name} onChange={(v: any) => update(`owners[${i}].name`, v)} />
              </div>
            </Grid3>
            <Grid3>
              <Select label="Relation" value={o.relation} onChange={(v: any) => update(`owners[${i}].relation`, v)} options={[{ value: "son", label: "son of" }, { value: "daughter", label: "daughter of" }, { value: "wife", label: "wife of" }, { value: "husband", label: "husband of" }]} />
              <Select label="Rel. Sal." value={o.relativeSalutation} onChange={(v: any) => update(`owners[${i}].relativeSalutation`, v)} options={[{ value: "Mr.", label: "Mr." }, { value: "Mrs.", label: "Mrs." }, { value: "late Mr.", label: "late Mr." }]} />
              <Field label="Rel. Name" value={o.relativeName} onChange={(v: any) => update(`owners[${i}].relativeName`, v)} />
            </Grid3>
            <Grid2>
              <Field label="PAN" value={o.pan} onChange={(v: any) => update(`owners[${i}].pan`, v.toUpperCase())} placeholder="ABCDE1234F" />
              <Field label="Aadhar" value={o.aadhar} onChange={(v: any) => update(`owners[${i}].aadhar`, v)} placeholder="0000 0000 0000" />
            </Grid2>
          </div>
        ))}
        {formData.owners.length < 3 && <button onClick={addOwner} className="add-btn">+ Add another owner</button>}
        <div style={{ marginTop: 12 }}>
          <TextArea label="Owner(s) Address" value={formData.ownerAddress} onChange={(v: any) => update("ownerAddress", v)} rows={2} />
        </div>
      </Section>

      <Section title="Property Details" defaultOpen={false}>
        <Grid2>
          <Field label="Configuration" value={formData.property.configuration} onChange={(v: any) => update("property.configuration", v)} placeholder="2BHK" />
          <Field label="Apartment No." value={formData.property.apartmentNo} onChange={(v: any) => update("property.apartmentNo", v)} />
          <Field label="Building No." value={formData.property.buildingNo} onChange={(v: any) => update("property.buildingNo", v)} />
          <Field label="Floor" value={formData.property.floor} onChange={(v: any) => update("property.floor", v)} />
          <Field label="Parking Count" value={formData.property.parkingCount} onChange={(v: any) => update("property.parkingCount", v)} />
          <Field label="Parking No." value={formData.property.parkingNo} onChange={(v: any) => update("property.parkingNo", v)} />
          <Field label="Area (sq ft)" value={formData.property.superAreaSqFt} onChange={(v: any) => update("property.superAreaSqFt", v)} />
          <Field label="Area (sq m)" value={formData.property.superAreaSqM} onChange={(v: any) => update("property.superAreaSqM", v)} />
        </Grid2>
        <Field label="Project Name" value={formData.property.projectName} onChange={(v: any) => update("property.projectName", v)} />
        <Grid2>
          <Field label="Village(s)" value={formData.property.village} onChange={(v: any) => update("property.village", v)} />
          <Field label="Sector" value={formData.property.sector} onChange={(v: any) => update("property.sector", v)} />
          <Field label="Sub-Tehsil" value={formData.property.subTehsil} onChange={(v: any) => update("property.subTehsil", v)} />
          <Field label="District" value={formData.property.district} onChange={(v: any) => update("property.district", v)} />
          <Field label="State" value={formData.property.state} onChange={(v: any) => update("property.state", v)} />
        </Grid2>
        <div className="divider">Conveyance Deed Registration</div>
        <Grid2>
          <Field label="Deed Serial No." value={formData.property.deedSerialNo} onChange={(v: any) => update("property.deedSerialNo", v)} />
          <Field label="Deed Date" value={formData.property.deedDate} onChange={(v: any) => update("property.deedDate", v)} placeholder="DD.MM.YYYY" />
          <Field label="Bahi Sankhya No." value={formData.property.bahiSankhyaNo} onChange={(v: any) => update("property.bahiSankhyaNo", v)} />
          <Field label="Jild No." value={formData.property.jildNo} onChange={(v: any) => update("property.jildNo", v)} />
          <Field label="Pages No." value={formData.property.pagesNo} onChange={(v: any) => update("property.pagesNo", v)} />
          <Field label="Addl. Bahi" value={formData.property.addlBahiNo} onChange={(v: any) => update("property.addlBahiNo", v)} />
          <Field label="Addl. Jild" value={formData.property.addlJildNo} onChange={(v: any) => update("property.addlJildNo", v)} />
          <Field label="Addl. Pages" value={formData.property.addlPages} onChange={(v: any) => update("property.addlPages", v)} />
        </Grid2>
      </Section>

      <Section title="Financial Terms" defaultOpen={false}>
        <Grid2>
          <Field label="Base Price (₹)" type="number" value={formData.financial.basePrice} onChange={(v: any) => update("financial.basePrice", v)} hint={`₹ ${formatINR(formData.financial.basePrice)} · ${toWordsIndian(formData.financial.basePrice)}`} />
          <Field label="Security Deposit (₹)" type="number" value={formData.financial.securityDeposit} onChange={(v: any) => update("financial.securityDeposit", v)} hint={`≈ ${((formData.financial.securityDeposit / Math.max(formData.financial.basePrice, 1)) * 100).toFixed(2)}% of base`} />
          <Field label="Monthly Rent (₹)" type="number" value={formData.financial.monthlyRent} onChange={(v: any) => update("financial.monthlyRent", v)} />
          <Field label="Furnishment Days" type="number" value={formData.financial.furnishmentDays} onChange={(v: any) => update("financial.furnishmentDays", v)} />
          <Field label="Initial Period (days)" type="number" value={formData.financial.initialPeriodDays} onChange={(v: any) => update("financial.initialPeriodDays", v)} />
          <Field label="Extension Period (days)" type="number" value={formData.financial.extensionPeriodDays} onChange={(v: any) => update("financial.extensionPeriodDays", v)} />
        </Grid2>
      </Section>

      {template.flags.showLoan && (
        <Section title="Existing Loan" defaultOpen={false}>
          <Field label="Outstanding Amount (₹)" type="number" value={formData.loan.outstandingAmount} onChange={(v: any) => update("loan.outstandingAmount", v)} hint={`₹ ${formatINR(formData.loan.outstandingAmount)}`} />
          <Grid2>
            <Field label="Bank Name" value={formData.loan.bankName} onChange={(v: any) => update("loan.bankName", v)} />
            <Field label="Loan Account No." value={formData.loan.loanAccountNo} onChange={(v: any) => update("loan.loanAccountNo", v)} />
          </Grid2>
        </Section>
      )}

      <Section title="Documents on Record" defaultOpen={false}>
        <Field label="Conveyance Deed No." value={formData.documents.conveyanceDeedNo} onChange={(v: any) => update("documents.conveyanceDeedNo", v)} />
        <Field label="Possession Certificate Date" value={formData.documents.possessionCertificateDate} onChange={(v: any) => update("documents.possessionCertificateDate", v)} placeholder="DD.MM.YYYY" />
        <Field label="Allotment Letter Date" value={formData.documents.allotmentLetterDate} onChange={(v: any) => update("documents.allotmentLetterDate", v)} placeholder="DD.MM.YYYY" />
      </Section>

      <Section title="Witnesses" defaultOpen={false}>
        <Field label="Witness 1" value={formData.witnesses[0]} onChange={(v: any) => update("witnesses[0]", v)} />
        <Field label="Witness 2" value={formData.witnesses[1]} onChange={(v: any) => update("witnesses[1]", v)} />
      </Section>
    </div>
  );
}

// ============================================================================
// SMALL UI HELPERS
// ============================================================================
function Section({ title, badge, children, defaultOpen = true }: { title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid #e7e0d0", borderRadius: 8, marginBottom: 12, background: "white", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#44403c" }}>{title}</span>
          {badge && (
            <span style={{ fontSize: 10, fontWeight: 500, color: "#92400e", background: "#fef3c7", padding: "1px 8px", borderRadius: 10 }}>
              {badge}
            </span>
          )}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#a8a29e", transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div style={{ padding: "4px 16px 16px", borderTop: "1px solid #f5f1e8" }}>{children}</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", hint }: any) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", color: "#78716c", marginBottom: 5, display: "block" }}>{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", background: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "#1c1917", fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
      />
      {hint && <span style={{ fontSize: 10, color: "#a8a29e", marginTop: 3, display: "block" }}>{hint}</span>}
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }: any) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", color: "#78716c", marginBottom: 5, display: "block" }}>{label}</span>
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{ width: "100%", background: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "#1c1917", fontFamily: "inherit", boxSizing: "border-box", outline: "none", resize: "none" }}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }: any) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", color: "#78716c", marginBottom: 5, display: "block" }}>{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", background: "#fafaf9", border: "1px solid #d6d3d1", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "#1c1917", fontFamily: "inherit" }}
      >
        {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{children}</div>;
}
function Grid3({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>{children}</div>;
}

// ============================================================================
// MERGE + DIFF HELPERS
// ============================================================================
function mergeExtracted(prev: any, extracted: any): any {
  const out = JSON.parse(JSON.stringify(prev));
  const merge = (a: any, b: any) => {
    for (const k of Object.keys(b)) {
      const v = b[k];
      if (v === null || v === undefined) continue;
      if (Array.isArray(v)) {
        if (v.length > 0 && v.some((x: any) => x && (typeof x !== "object" || Object.values(x).some(Boolean)))) {
          a[k] = v;
        }
      } else if (typeof v === "object") {
        if (!a[k]) a[k] = {};
        merge(a[k], v);
      } else if (v !== "" && v !== 0) {
        a[k] = v;
      } else if (v !== "") {
        a[k] = v;
      }
    }
  };
  merge(out, extracted);
  return out;
}

function diffPaths(oldObj: any, newObj: any, prefix = ""): string[] {
  const out: string[] = [];
  const walk = (a: any, b: any, path: string) => {
    if (Array.isArray(b)) {
      for (let i = 0; i < b.length; i++) walk(a ? a[i] : undefined, b[i], `${path}[${i}]`);
      return;
    }
    if (b && typeof b === "object") {
      for (const k of Object.keys(b)) walk(a ? a[k] : undefined, b[k], path ? `${path}.${k}` : k);
      return;
    }
    if (a !== b) out.push(path);
  };
  walk(oldObj, newObj, prefix);
  return out;
}

function generatePlainText(model: any): string {
  const lines: string[] = [];
  lines.push("ASSET MANAGEMENT AGREEMENT", "");
  lines.push(stripTokens(model.preamble), "");
  lines.push("BY AND BETWEEN", "");
  lines.push(stripTokens(model.ownerParty), "");
  lines.push("AND", "");
  lines.push("M/s " + stripTokens(model.assetManagerParty), "");
  lines.push("WHEREAS:", "");
  lines.push(stripTokens(model.whereas1), "");
  lines.push(stripTokens(model.whereas2), "");
  lines.push(stripTokens(model.priceBlock), "");
  lines.push("THEREFORE, THE PARTIES HEREBY AGREE AS FOLLOWS:", "");
  model.clauses.forEach((c: any, i: number) => {
    lines.push(`${i + 1}. ${c.title}`);
    lines.push(stripTokens(c.text), "");
  });
  return lines.join("\n");
}
