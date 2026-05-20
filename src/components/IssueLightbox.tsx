"use client";

import { useEffect } from "react";
import type { FlaggedIssue } from "@/lib/types/inspect";
import styles from "./IssueLightbox.module.css";

type Props = {
  issue: FlaggedIssue;
  onClose: () => void;
  onToggleResolved: (issue: FlaggedIssue) => void;
  onDelete: (issue: FlaggedIssue) => void;
};

export function IssueLightbox({ issue, onClose, onToggleResolved, onDelete }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const resolved = Boolean(issue.resolved);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerMeta}>
            <span className={resolved ? styles.statusResolved : styles.statusOpen}>
              {resolved ? "Resolved" : "Open"}
            </span>
            <span className={styles.category}>{issue.category}</span>
            <span className={styles.breakpoint}>{issue.breakpointLabel}</span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className={styles.body}>
          <h2 className={styles.elementLabel}>{issue.elementLabel}</h2>
          <p className={styles.elementKind}>
            <code>{issue.elementKind}</code> &nbsp;·&nbsp; flagged{" "}
            {formatRelative(issue.createdAt)}
            {resolved && issue.resolvedAt && (
              <> &nbsp;·&nbsp; resolved {formatRelative(issue.resolvedAt)}</>
            )}
          </p>

          <dl className={styles.fields}>
            <Field label="Property">
              <code>{issue.property}</code>
            </Field>
            <Field label="Expected (Figma)">{issue.expected || "—"}</Field>
            <Field label="Actual (Site)">{issue.actual || "—"}</Field>
            <Field label="Notes" full>
              {issue.notes ? <p className={styles.notes}>{issue.notes}</p> : "—"}
            </Field>
          </dl>
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={() => {
              if (confirm("Delete this flagged issue?")) onDelete(issue);
            }}
          >
            Delete
          </button>
          <button
            type="button"
            className={resolved ? styles.reopenBtn : styles.resolveBtn}
            onClick={() => onToggleResolved(issue)}
          >
            {resolved ? "Mark as open" : "Mark as resolved"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? styles.fieldFull : styles.field}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
