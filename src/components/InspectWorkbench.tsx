"use client";

import { useMemo, useState } from "react";
import { compareMetrics } from "@/lib/inspect/compare-metrics";
import { DESKTOP_DEFAULT_WIDTH } from "@/lib/inspect/constants";
import { IssueLightbox } from "./IssueLightbox";
import {
  hitTestElement,
  rectToPercentAnchor,
} from "@/lib/capture/inspect-sample";
import { downloadInspectionJson } from "@/lib/export/inspection";
import type {
  FlaggedIssue,
  InspectableElement,
  InspectionSession,
  IssueCategory,
} from "@/lib/types/inspect";
import styles from "./InspectWorkbench.module.css";

type Props = {
  session: InspectionSession;
  onUpdate: (session: InspectionSession) => void;
};

const CATEGORIES: IssueCategory[] = [
  "spacing",
  "typography",
  "image",
  "layout",
  "other",
];

function defaultBreakpointWidth(session: InspectionSession): number {
  const mobile = session.breakpoints.find((b) => b.isDefaultMobile);
  return mobile?.width ?? session.breakpoints[0]?.width ?? 0;
}

export function InspectWorkbench({ session, onUpdate }: Props) {
  const [activeWidth, setActiveWidth] = useState(() => defaultBreakpointWidth(session));
  const [figmaSelected, setFigmaSelected] = useState<InspectableElement | null>(null);
  const [siteSelected, setSiteSelected] = useState<InspectableElement | null>(null);
  const [flagProperty, setFlagProperty] = useState("");
  const [flagExpected, setFlagExpected] = useState("");
  const [flagActual, setFlagActual] = useState("");
  const [flagCategory, setFlagCategory] = useState<IssueCategory>("spacing");
  const [flagNotes, setFlagNotes] = useState("");
  const [onlyCurrentBreakpoint, setOnlyCurrentBreakpoint] = useState(false);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);

  const bp = session.breakpoints.find((b) => b.width === activeWidth) ?? session.breakpoints[0];

  const figmaAnchor = useMemo(() => {
    if (!figmaSelected || !bp) return null;
    return rectToPercentAnchor(
      figmaSelected.rect,
      bp.figmaViewportWidth ?? bp.viewportWidth,
      bp.figmaViewportHeight ?? bp.viewportHeight
    );
  }, [figmaSelected, bp]);

  const siteAnchor = useMemo(() => {
    if (!siteSelected || !bp) return null;
    return rectToPercentAnchor(siteSelected.rect, bp.viewportWidth, bp.viewportHeight);
  }, [siteSelected, bp]);

  const discrepancies = useMemo(() => {
    if (!figmaSelected || !siteSelected) return null;
    return compareMetrics(figmaSelected.metrics, siteSelected.metrics);
  }, [figmaSelected, siteSelected]);

  function selectFigma(el: InspectableElement | null) {
    setFigmaSelected(el);
  }

  function selectSite(el: InspectableElement | null) {
    setSiteSelected(el);
    if (!el) return;
    setFlagProperty("");
    setFlagExpected("");
    setFlagActual("");
    setFlagNotes("");
    if (el.kind === "text") setFlagCategory("typography");
    else if (el.kind === "image") setFlagCategory("image");
    else if (el.kind === "section") setFlagCategory("spacing");
    else setFlagCategory("layout");
  }

  function handleFigmaClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!bp) return;
    const fw = bp.figmaViewportWidth ?? bp.viewportWidth;
    const fh = bp.figmaViewportHeight ?? bp.viewportHeight;
    const box = e.currentTarget.getBoundingClientRect();
    const xPx = ((e.clientX - box.left) / box.width) * fw;
    const yPx = ((e.clientY - box.top) / box.height) * fh;
    const hit = hitTestElement(bp.figmaElements ?? [], xPx, yPx, {
      preferSection: !e.shiftKey,
    });
    selectFigma(hit);
  }

  function handleSiteClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!bp) return;
    const box = e.currentTarget.getBoundingClientRect();
    const xPx = ((e.clientX - box.left) / box.width) * bp.viewportWidth;
    const yPx = ((e.clientY - box.top) / box.height) * bp.viewportHeight;
    const hit = hitTestElement(bp.elements, xPx, yPx, { preferSection: !e.shiftKey });
    selectSite(hit);
  }

  function quickFlag(property: string, actual: string, category?: IssueCategory) {
    setFlagProperty(property);
    setFlagActual(actual);
    if (category) setFlagCategory(category);
  }

  function useFigmaAsExpected(property: string, value: string) {
    setFlagProperty(property);
    setFlagExpected(value);
    if (!flagActual && siteSelected) {
      const m = siteSelected.metrics;
      if (property === "size") setFlagActual(`${m.width}×${m.height}px`);
      else if (property === "gap-after" && m.gapAfter != null) setFlagActual(`${m.gapAfter}px`);
      else if (property.startsWith("padding-")) {
        const side = property.replace("padding-", "") as keyof typeof m.padding;
        setFlagActual(m.padding[side]);
      } else if (property === "font-size" && m.fontSize) setFlagActual(m.fontSize);
      else if (property === "font-weight" && m.fontWeight) setFlagActual(m.fontWeight);
    }
  }

  const flagDisabledReason = (() => {
    if (!bp) return "No breakpoint";
    if (!siteSelected) return "Click an element on the live site first";
    return null;
  })();

  function defaultPropertyForCategory(cat: IssueCategory): string {
    switch (cat) {
      case "spacing":
        return "padding-top";
      case "typography":
        return "font-size";
      case "image":
        return "size";
      case "layout":
        return "size";
      default:
        return "general";
    }
  }

  function addFlag() {
    if (!siteSelected || !bp) return;

    const property = flagProperty.trim() || defaultPropertyForCategory(flagCategory);

    const issue: FlaggedIssue = {
      id: `issue_${Date.now()}`,
      createdAt: new Date().toISOString(),
      breakpointWidth: bp.width,
      breakpointLabel: bp.label,
      elementId: siteSelected.id,
      elementLabel: siteSelected.label,
      elementKind: siteSelected.kind,
      category: flagCategory,
      property,
      expected: flagExpected.trim(),
      actual: flagActual.trim(),
      notes: flagNotes.trim(),
      anchor: rectToPercentAnchor(siteSelected.rect, bp.viewportWidth, bp.viewportHeight),
    };

    onUpdate({
      ...session,
      issues: [...session.issues, issue],
    });

    setFlagProperty("");
    setFlagExpected("");
    setFlagActual("");
    setFlagNotes("");

    fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        websiteUrl: session.websiteUrl,
        sessionId: session.id,
        issue,
      }),
    }).catch((err) => console.warn("Failed to persist issue:", err));
  }

  function removeFlag(id: string) {
    onUpdate({
      ...session,
      issues: session.issues.filter((i) => i.id !== id),
    });
    if (openIssueId === id) setOpenIssueId(null);

    fetch(`/api/issues/${encodeURIComponent(id)}`, { method: "DELETE" }).catch((err) =>
      console.warn("Failed to delete persisted issue:", err)
    );
  }

  function toggleResolved(issue: FlaggedIssue) {
    const next: FlaggedIssue = {
      ...issue,
      resolved: !issue.resolved,
      resolvedAt: !issue.resolved ? new Date().toISOString() : null,
    };
    onUpdate({
      ...session,
      issues: session.issues.map((i) => (i.id === issue.id ? next : i)),
    });

    fetch(`/api/issues/${encodeURIComponent(issue.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: next.resolved }),
    }).catch((err) => console.warn("Failed to update issue:", err));
  }

  if (!bp) return null;

  const bpIssues = session.issues.filter((i) => i.breakpointWidth === bp.width);
  const visibleIssues = onlyCurrentBreakpoint ? bpIssues : session.issues;
  const figmaElements = bp.figmaElements ?? [];

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {session.breakpoints.map((b) => {
            const tabClass = [
              activeWidth === b.width ? styles.tabActive : styles.tab,
              b.isDefaultMobile || b.isDefaultDesktop ? styles.tabDefault : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={b.width}
                type="button"
                className={tabClass}
                onClick={() => {
                  setActiveWidth(b.width);
                  setFigmaSelected(null);
                  setSiteSelected(null);
                }}
              >
                {b.label}
                {(b.isDefaultMobile || b.isDefaultDesktop) && (
                  <span className={styles.defaultBadge}>default</span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={styles.exportBtn}
          onClick={() => downloadInspectionJson({ ...session, issues: session.issues })}
        >
          Export JSON ({session.issues.length} issues)
        </button>
      </div>

      <p className={styles.hint}>
        Click selects the <strong>smallest containing layout block</strong> (section) for spacing.
        <strong> Shift+click</strong> picks the deepest element (text, image, inner frame) for
        typography or asset size. Re-capture after updating the app so Figma/site element lists
        refresh.
      </p>

      <div className={styles.grid}>
        <figure className={styles.figure}>
          <figcaption>Figma — click to inspect</figcaption>
          <div
            className={`${styles.stage} ${styles.stageFigma}`}
            onClick={handleFigmaClick}
          >
            <img src={bp.figmaPath} alt="Figma" className={styles.shot} draggable={false} />
            <div className={styles.overlay}>
              {figmaAnchor && (
                <div
                  className={styles.figmaHighlight}
                  style={{
                    left: `${figmaAnchor.x}%`,
                    top: `${figmaAnchor.y}%`,
                    width: `${figmaAnchor.width}%`,
                    height: `${figmaAnchor.height}%`,
                  }}
                />
              )}
            </div>
          </div>
        </figure>

        <figure className={styles.figure}>
          <figcaption>Live site — click to inspect &amp; flag</figcaption>
          <div className={styles.stage} onClick={handleSiteClick}>
            <img src={bp.sitePath} alt="Site" className={styles.shot} draggable={false} />
            <div className={styles.overlay}>
              {siteAnchor && (
                <div
                  className={styles.selectedHighlight}
                  style={{
                    left: `${siteAnchor.x}%`,
                    top: `${siteAnchor.y}%`,
                    width: `${siteAnchor.width}%`,
                    height: `${siteAnchor.height}%`,
                  }}
                />
              )}
              {session.issues
                .filter((i) => i.breakpointWidth === bp.width)
                .map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    className={`${styles.flaggedHighlight} ${issue.resolved ? styles.flaggedResolved : ""}`}
                    style={{
                      left: `${issue.anchor.x}%`,
                      top: `${issue.anchor.y}%`,
                      width: `${issue.anchor.width}%`,
                      height: `${issue.anchor.height}%`,
                    }}
                    title={`${issue.property} — click to view`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenIssueId(issue.id);
                    }}
                  />
                ))}
            </div>
          </div>
        </figure>

        <aside className={styles.inspector}>
          {!figmaSelected && !siteSelected ? (
            <p className={styles.empty}>
              Click an element on Figma or the site to inspect. Defaults: mobile and{" "}
              {DESKTOP_DEFAULT_WIDTH}px desktop.
            </p>
          ) : (
            <>
              {discrepancies && discrepancies.size > 0 && (
                <p className={styles.compareBanner} role="status">
                  <strong>{discrepancies.size}</strong>{" "}
                  {discrepancies.size === 1 ? "discrepancy" : "discrepancies"} between selected
                  sections
                </p>
              )}
              {discrepancies && discrepancies.size === 0 && figmaSelected && siteSelected && (
                <p className={styles.compareBanner} role="status">
                  Selected sections match on all compared metrics
                </p>
              )}

              {figmaSelected && (
                <section className={styles.inspectBlock}>
                  <header className={styles.inspectorHeader}>
                    <span className={styles.sourceFigma}>Figma</span>
                    <span className={styles.kind}>{figmaSelected.kind}</span>
                    <strong>{figmaSelected.label}</strong>
                    <code>{figmaSelected.tag}</code>
                  </header>
                  <MetricsPanel
                    el={figmaSelected}
                    readOnly
                    discrepancies={discrepancies ?? undefined}
                    onUseExpected={useFigmaAsExpected}
                  />
                </section>
              )}

              {siteSelected && (
                <section className={styles.inspectBlock}>
                  <header className={styles.inspectorHeader}>
                    <span className={styles.sourceSite}>Live site</span>
                    <span className={styles.kind}>{siteSelected.kind}</span>
                    <strong>{siteSelected.label}</strong>
                    <code>{siteSelected.tag}</code>
                  </header>
                  <MetricsPanel
                    el={siteSelected}
                    discrepancies={discrepancies ?? undefined}
                    onQuickFlag={quickFlag}
                  />

                  <section className={styles.flagForm}>
                    <h3>Flag issue</h3>
                    <label>
                      Category
                      <select
                        value={flagCategory}
                        onChange={(e) => setFlagCategory(e.target.value as IssueCategory)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Property
                      <input
                        value={flagProperty}
                        onChange={(e) => setFlagProperty(e.target.value)}
                        placeholder="e.g. gap-after, padding-top, font-size"
                      />
                    </label>
                    <label>
                      Expected (Figma)
                      <input
                        value={flagExpected}
                        onChange={(e) => setFlagExpected(e.target.value)}
                        placeholder="e.g. 24px"
                      />
                    </label>
                    <label>
                      Actual (site)
                      <input
                        value={flagActual}
                        onChange={(e) => setFlagActual(e.target.value)}
                        placeholder="from metrics or override"
                      />
                    </label>
                    <label>
                      Notes
                      <textarea
                        rows={2}
                        value={flagNotes}
                        onChange={(e) => setFlagNotes(e.target.value)}
                        placeholder="optional context"
                      />
                    </label>
                    <button
                      type="button"
                      className={styles.flagBtn}
                      onClick={addFlag}
                      disabled={Boolean(flagDisabledReason)}
                      title={flagDisabledReason ?? "Add flagged issue"}
                    >
                      Add flagged issue
                    </button>
                    {flagDisabledReason && (
                      <p className={styles.flagHint}>{flagDisabledReason}</p>
                    )}
                  </section>
                </section>
              )}
            </>
          )}
        </aside>
      </div>

      {session.issues.length > 0 ? (
        <section className={styles.issueList}>
          <header className={styles.issueListHeader}>
            <h3>
              Flagged issues
              <span className={styles.issueCount}>
                {visibleIssues.length} of {session.issues.length}
              </span>
            </h3>
            <label className={styles.issueFilter}>
              <input
                type="checkbox"
                checked={onlyCurrentBreakpoint}
                onChange={(e) => setOnlyCurrentBreakpoint(e.target.checked)}
              />
              Only {bp.label}
            </label>
          </header>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Breakpoint</th>
                <th>Element</th>
                <th>Category</th>
                <th>Property</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {visibleIssues.map((issue) => (
                <tr
                  key={issue.id}
                  className={[
                    styles.issueRow,
                    issue.resolved ? styles.issueRowResolved : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setOpenIssueId(issue.id)}
                >
                  <td>
                    <span
                      className={
                        issue.resolved ? styles.statusResolved : styles.statusOpen
                      }
                    >
                      {issue.resolved ? "Resolved" : "Open"}
                    </span>
                  </td>
                  <td className={styles.issueBreakpoint}>{issue.breakpointLabel}</td>
                  <td>{issue.elementLabel}</td>
                  <td>{issue.category}</td>
                  <td>
                    <code>{issue.property}</code>
                  </td>
                  <td>{issue.expected || "—"}</td>
                  <td>{issue.actual || "—"}</td>
                  <td className={styles.issueNotes} title={issue.notes}>
                    {issue.notes
                      ? issue.notes.length > 60
                        ? `${issue.notes.slice(0, 60)}…`
                        : issue.notes
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className={styles.issueList}>
          <h3>Flagged issues</h3>
          <p className={styles.empty}>
            No issues flagged yet. Select an element on the live site and use{" "}
            <strong>Add flagged issue</strong>.
          </p>
        </section>
      )}

      {openIssueId &&
        (() => {
          const issue = session.issues.find((i) => i.id === openIssueId);
          if (!issue) return null;
          return (
            <IssueLightbox
              issue={issue}
              onClose={() => setOpenIssueId(null)}
              onToggleResolved={toggleResolved}
              onDelete={(i) => removeFlag(i.id)}
            />
          );
        })()}
    </div>
  );
}

function MetricsPanel({
  el,
  readOnly,
  discrepancies,
  onQuickFlag,
  onUseExpected,
}: {
  el: InspectableElement;
  readOnly?: boolean;
  discrepancies?: Set<string>;
  onQuickFlag?: (property: string, actual: string, category?: IssueCategory) => void;
  onUseExpected?: (property: string, value: string) => void;
}) {
  const m = el.metrics;
  const isOff = (key: string) => discrepancies?.has(key) ?? false;

  return (
    <div className={styles.metrics}>
      <MetricRow
        label="Size"
        value={`${m.width} × ${m.height}px`}
        discrepancy={isOff("size")}
        onFlag={readOnly ? undefined : () => onQuickFlag?.("size", `${m.width}×${m.height}px`, "layout")}
        onUseExpected={
          readOnly ? () => onUseExpected?.("size", `${m.width}×${m.height}px`) : undefined
        }
        readOnly={readOnly}
      />

      {m.gap != null && (
        <MetricRow
          label="Layout gap"
          value={m.gap}
          discrepancy={isOff("gap")}
          onUseExpected={readOnly ? () => onUseExpected?.("gap", m.gap!) : undefined}
          readOnly={readOnly}
        />
      )}

      {(m.gapAfter != null || isOff("gap-after")) && (
        <MetricRow
          label="Gap below"
          value={m.gapAfter != null ? `${m.gapAfter}px` : "—"}
          discrepancy={isOff("gap-after")}
          onFlag={
            readOnly ? undefined : () => onQuickFlag?.("gap-after", `${m.gapAfter}px`, "spacing")
          }
          onUseExpected={
            readOnly ? () => onUseExpected?.("gap-after", `${m.gapAfter}px`) : undefined
          }
          readOnly={readOnly}
        />
      )}

      <h4>Padding</h4>
      <BoxSidesRow
        prefix="padding"
        sides={m.padding}
        discrepancies={discrepancies}
        readOnly={readOnly}
        onQuickFlag={onQuickFlag}
        onUseExpected={onUseExpected}
        category="spacing"
      />

      <h4>Margin</h4>
      <BoxSidesRow
        prefix="margin"
        sides={m.margin}
        discrepancies={discrepancies}
        readOnly={readOnly}
        onQuickFlag={onQuickFlag}
        onUseExpected={onUseExpected}
        category="spacing"
      />

      {m.fontSize && (
        <>
          <h4>Typography</h4>
          <MetricRow
            label="Font size"
            value={m.fontSize}
            discrepancy={isOff("font-size")}
            onFlag={readOnly ? undefined : () => onQuickFlag?.("font-size", m.fontSize!, "typography")}
            onUseExpected={readOnly ? () => onUseExpected?.("font-size", m.fontSize!) : undefined}
            readOnly={readOnly}
          />
          <MetricRow
            label="Font weight"
            value={m.fontWeight ?? "—"}
            discrepancy={isOff("font-weight")}
            onFlag={
              readOnly
                ? undefined
                : () => onQuickFlag?.("font-weight", m.fontWeight ?? "", "typography")
            }
            onUseExpected={
              readOnly ? () => onUseExpected?.("font-weight", m.fontWeight ?? "") : undefined
            }
            readOnly={readOnly}
          />
          <MetricRow
            label="Line height"
            value={m.lineHeight ?? "—"}
            discrepancy={isOff("line-height")}
            readOnly={readOnly}
          />
          <MetricRow
            label="Font family"
            value={truncate(m.fontFamily ?? "", 32)}
            discrepancy={isOff("font-family")}
            small
            readOnly={readOnly}
          />
        </>
      )}
    </div>
  );
}

function MetricRow({
  label,
  value,
  discrepancy,
  onFlag,
  onUseExpected,
  small,
  readOnly,
}: {
  label: string;
  value: string;
  discrepancy?: boolean;
  onFlag?: () => void;
  onUseExpected?: () => void;
  small?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div
      className={[styles.metricRow, discrepancy ? styles.metricRowDiscrepancy : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={styles.metricLabel}>{label}</span>
      <span className={small ? styles.metricValueSmall : styles.metricValue}>{value}</span>
      {readOnly && onUseExpected && (
        <button type="button" className={styles.useExpected} onClick={onUseExpected}>
          Use as expected
        </button>
      )}
      {!readOnly && onFlag && (
        <button type="button" className={styles.quickFlag} onClick={onFlag}>
          Flag
        </button>
      )}
    </div>
  );
}

function BoxSidesRow({
  prefix,
  sides,
  discrepancies,
  readOnly,
  onQuickFlag,
  onUseExpected,
  category,
}: {
  prefix: string;
  sides: { top: string; right: string; bottom: string; left: string };
  discrepancies?: Set<string>;
  readOnly?: boolean;
  onQuickFlag?: (property: string, actual: string, category?: IssueCategory) => void;
  onUseExpected?: (property: string, value: string) => void;
  category: IssueCategory;
}) {
  return (
    <div className={styles.boxGrid}>
      {(["top", "right", "bottom", "left"] as const).map((side) => {
        const propKey = `${prefix}-${side}`;
        const discrepancy = discrepancies?.has(propKey) ?? false;
        return (
        <button
          key={side}
          type="button"
          className={[styles.boxCell, discrepancy ? styles.boxCellDiscrepancy : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => {
            if (readOnly) onUseExpected?.(`${prefix}-${side}`, sides[side]);
            else onQuickFlag?.(`${prefix}-${side}`, sides[side], category);
          }}
          title={readOnly ? `Use ${prefix}-${side} as expected` : `Flag ${prefix}-${side}`}
        >
          <span>{side}</span>
          <code>{sides[side]}</code>
        </button>
        );
      })}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
