"use client";

import React from "react";
import { TOKEN_RE } from "@/lib/contract";

export default function Tokenized({
  text,
  recentChanges,
  onEditRequest,
  editingPath,
}: {
  text: string;
  recentChanges: Map<string, number>;
  onEditRequest: (path: string, target: HTMLElement) => void;
  editingPath?: string | null;
}) {
  if (!text) return null;
  const nodes: React.ReactNode[] = [];
  const regex = new RegExp(TOKEN_RE.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let k = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <React.Fragment key={`t${k++}`}>
          {text.slice(lastIndex, match.index)}
        </React.Fragment>
      );
    }
    const path = match[1];
    const display = match[2];
    const isChanged = recentChanges.has(path);
    const isEditing = editingPath === path;
    nodes.push(
      <span
        key={`e${k++}`}
        className={`editable${isChanged ? " changed" : ""}${isEditing ? " editing" : ""}`}
        data-path={path}
        onClick={(ev) => {
          ev.stopPropagation();
          onEditRequest(path, ev.currentTarget);
        }}
        title="Click to edit"
      >
        {display}
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<React.Fragment key={`t${k++}`}>{text.slice(lastIndex)}</React.Fragment>);
  }
  return <>{nodes}</>;
}
