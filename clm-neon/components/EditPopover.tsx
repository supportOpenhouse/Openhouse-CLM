"use client";

import { useEffect, useRef, useState } from "react";

export type EditingState = {
  path: string;
  rawValue: any;
  label: string;
  hint?: string;
  isNumber?: boolean;
  multiline?: boolean;
  options?: { value: string; label: string }[];
  position: { x: number; y: number };
};

export default function EditPopover({
  editing,
  onCancel,
  onSave,
}: {
  editing: EditingState | null;
  onCancel: () => void;
  onSave: (value: any) => void;
}) {
  const [value, setValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (editing) {
      const raw = editing.rawValue;
      setValue(raw == null ? "" : String(raw));
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          if ("select" in inputRef.current) inputRef.current.select();
        }
      }, 20);
    }
  }, [editing]);

  if (!editing) return null;

  function handleSave() {
    let finalValue: any = value;
    if (editing!.isNumber) {
      const cleaned = String(value).trim().toLowerCase().replace(/,/g, "").replace(/₹|rs\.?/g, "").trim();
      const m = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*(cr|crore|l|lakh|lac|k|thousand)?$/);
      if (m) {
        const n = parseFloat(m[1]);
        const unit = m[2];
        const mult =
          unit === "cr" || unit === "crore" ? 10000000 :
          unit === "l" || unit === "lakh" || unit === "lac" ? 100000 :
          unit === "k" || unit === "thousand" ? 1000 : 1;
        finalValue = Math.round(n * mult);
      } else {
        finalValue = Number(value) || 0;
      }
    }
    onSave(finalValue);
  }

  const { x, y } = editing.position;
  const popoverStyle: React.CSSProperties = {
    left: Math.max(12, Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 320)),
    top: y,
  };
  const isSelect = Array.isArray(editing.options);

  return (
    <>
      <div className="edit-popover-backdrop" onClick={onCancel} />
      <div className="edit-popover" style={popoverStyle}>
        <div className="edit-popover-label">
          {editing.label}
          {editing.hint && <span className="edit-popover-hint"> · {editing.hint}</span>}
        </div>
        {isSelect ? (
          <select
            ref={inputRef as any}
            value={value}
            onChange={(ev) => setValue(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") handleSave();
              if (ev.key === "Escape") onCancel();
            }}
          >
            {editing.options!.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : editing.multiline ? (
          <textarea
            ref={inputRef as any}
            rows={3}
            value={value}
            onChange={(ev) => setValue(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) handleSave();
              if (ev.key === "Escape") onCancel();
            }}
          />
        ) : (
          <input
            ref={inputRef as any}
            type="text"
            value={value}
            onChange={(ev) => setValue(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") handleSave();
              if (ev.key === "Escape") onCancel();
            }}
          />
        )}
        <div className="edit-popover-actions">
          <button className="edit-popover-cancel" onClick={onCancel}>Cancel</button>
          <button className="edit-popover-save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </>
  );
}
