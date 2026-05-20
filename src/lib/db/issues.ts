import type { RowDataPacket } from "mysql2";
import { ensureSchema, getPool, isDbConfigured } from "@/lib/db/mysql";
import { urlKey } from "@/lib/url-key";
import type { FlaggedIssue, InspectableElement } from "@/lib/types/inspect";

interface IssueRow extends RowDataPacket {
  id: string;
  website_url: string;
  url_key: string;
  created_at: Date;
  session_id: string | null;
  breakpoint_width: number;
  breakpoint_label: string;
  element_id: string;
  element_label: string;
  element_kind: string;
  category: string;
  property: string;
  expected: string;
  actual: string;
  notes: string;
  anchor_x: string | number;
  anchor_y: string | number;
  anchor_w: string | number;
  anchor_h: string | number;
  resolved: number;
  resolved_at: Date | null;
}

function rowToIssue(r: IssueRow): FlaggedIssue {
  return {
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    breakpointWidth: r.breakpoint_width,
    breakpointLabel: r.breakpoint_label,
    elementId: r.element_id,
    elementLabel: r.element_label,
    elementKind: r.element_kind as InspectableElement["kind"],
    category: r.category as FlaggedIssue["category"],
    property: r.property,
    expected: r.expected,
    actual: r.actual,
    notes: r.notes,
    anchor: {
      x: Number(r.anchor_x),
      y: Number(r.anchor_y),
      width: Number(r.anchor_w),
      height: Number(r.anchor_h),
    },
    resolved: Boolean(r.resolved),
    resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
  };
}

export async function getIssuesForUrl(websiteUrl: string): Promise<FlaggedIssue[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const pool = getPool();
  const [rows] = await pool.query<IssueRow[]>(
    "SELECT * FROM flagged_issues WHERE url_key = ? ORDER BY breakpoint_width, created_at",
    [urlKey(websiteUrl)]
  );
  return rows.map(rowToIssue);
}

export async function upsertIssue(
  websiteUrl: string,
  sessionId: string | null,
  issue: FlaggedIssue
): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `INSERT INTO flagged_issues (
       id, website_url, url_key, created_at, session_id,
       breakpoint_width, breakpoint_label,
       element_id, element_label, element_kind,
       category, property, expected, actual, notes,
       anchor_x, anchor_y, anchor_w, anchor_h,
       resolved, resolved_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       website_url = VALUES(website_url),
       url_key = VALUES(url_key),
       session_id = VALUES(session_id),
       breakpoint_width = VALUES(breakpoint_width),
       breakpoint_label = VALUES(breakpoint_label),
       element_id = VALUES(element_id),
       element_label = VALUES(element_label),
       element_kind = VALUES(element_kind),
       category = VALUES(category),
       property = VALUES(property),
       expected = VALUES(expected),
       actual = VALUES(actual),
       notes = VALUES(notes),
       anchor_x = VALUES(anchor_x),
       anchor_y = VALUES(anchor_y),
       anchor_w = VALUES(anchor_w),
       anchor_h = VALUES(anchor_h),
       resolved = VALUES(resolved),
       resolved_at = VALUES(resolved_at)
    `,
    [
      issue.id,
      websiteUrl,
      urlKey(websiteUrl),
      new Date(issue.createdAt),
      sessionId,
      issue.breakpointWidth,
      issue.breakpointLabel,
      issue.elementId,
      issue.elementLabel,
      issue.elementKind,
      issue.category,
      issue.property,
      issue.expected,
      issue.actual,
      issue.notes,
      issue.anchor.x,
      issue.anchor.y,
      issue.anchor.width,
      issue.anchor.height,
      issue.resolved ? 1 : 0,
      issue.resolvedAt ? new Date(issue.resolvedAt) : null,
    ]
  );
}

export async function setIssueResolved(id: string, resolved: boolean): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `UPDATE flagged_issues
        SET resolved = ?, resolved_at = ?
      WHERE id = ?`,
    [resolved ? 1 : 0, resolved ? new Date() : null, id]
  );
}

export async function deleteIssue(id: string): Promise<void> {
  if (!isDbConfigured()) return;
  await ensureSchema();
  const pool = getPool();
  await pool.query("DELETE FROM flagged_issues WHERE id = ?", [id]);
}
