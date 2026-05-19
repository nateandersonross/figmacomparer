import type { FigmaImage, FigmaSection, FigmaText } from "@/lib/figma/extract-layout";
import type { LayoutSample, SiteText } from "@/lib/capture/layout-sample";
import { gapAnchor, rectToAnchor } from "@/lib/compare/anchors";
import { matchImages, matchSections } from "@/lib/compare/match-elements";
import type { DesignAudit, Discrepancy } from "@/lib/types";

const TOLERANCE = {
  spacing: 4,
  fontSize: 1,
  image: 8,
};

export function runDesignAudit(
  figmaSections: FigmaSection[],
  figmaImages: FigmaImage[],
  figmaTexts: FigmaText[],
  site: LayoutSample,
  figmaFrame: { width: number; height: number }
): DesignAudit {
  const vw = site.viewportWidth;
  const vh = site.viewportHeight;
  const fw = figmaFrame.width;
  const fh = figmaFrame.height;

  const discrepancies: Discrepancy[] = [
    ...auditSectionSpacing(figmaSections, site.sections, vw, vh, fw, fh),
    ...auditTypography(figmaTexts, site.texts, vw, vh, fw, fh),
    ...auditImages(figmaImages, site.images, vw, vh, fw, fh),
  ];

  const byCategory = {
    typography: discrepancies.filter((d) => d.category === "typography"),
    spacing: discrepancies.filter((d) => d.category === "spacing"),
    image: discrepancies.filter((d) => d.category === "image"),
  };

  return {
    discrepancies,
    byCategory,
    counts: {
      typography: byCategory.typography.length,
      spacing: byCategory.spacing.length,
      image: byCategory.image.length,
      total: discrepancies.length,
    },
  };
}

function auditSectionSpacing(
  figma: FigmaSection[],
  site: LayoutSample["sections"],
  vw: number,
  vh: number,
  fw: number,
  fh: number
): Discrepancy[] {
  const out: Discrepancy[] = [];
  const pairs = matchSections(figma, site, fh, vh);

  for (const { figma: f, site: s } of pairs) {
    const pairId = `${f.name}-${s.index}`;

    if (f.gapAfter != null && s.gapAfter != null) {
      const diff = s.gapAfter - f.gapAfter;
      if (Math.abs(diff) > TOLERANCE.spacing) {
        out.push({
          id: `spacing-gap-${pairId}`,
          category: "spacing",
          name: f.name,
          property: "Gap after section",
          figma: `${f.gapAfter}px`,
          site: `${s.gapAfter}px`,
          delta: formatDelta(diff, "px"),
          severity: Math.abs(diff) > 12 ? "error" : "warning",
          anchor: gapAnchor(s.rect, s.gapAfter, vw, vh),
          figmaAnchor: gapAnchor(f.rect, f.gapAfter, fw, fh),
        });
      }
    }

    const heightDiff = s.rect.height - f.height;
    if (Math.abs(heightDiff) > 16) {
      out.push({
        id: `spacing-height-${pairId}`,
        category: "spacing",
        name: f.name,
        property: "Section height",
        figma: `${f.height}px`,
        site: `${s.rect.height}px`,
        delta: formatDelta(heightDiff, "px"),
        severity: Math.abs(heightDiff) > 40 ? "error" : "warning",
        anchor: rectToAnchor(s.rect, vw, vh),
        figmaAnchor: rectToAnchor(f.rect, fw, fh),
      });
    }
  }

  const unmatchedFigma = figma.length - pairs.length;
  const unmatchedSite = site.length - pairs.length;
  if (unmatchedFigma > 1 || unmatchedSite > 1) {
    out.push({
      id: "spacing-section-count",
      category: "spacing",
      name: "Page structure",
      property: "Unmatched sections",
      figma: `${figma.length} (${pairs.length} paired)`,
      site: `${site.length} (${pairs.length} paired)`,
      delta: `${unmatchedSite > unmatchedFigma ? "+" : ""}${site.length - figma.length}`,
      severity: "warning",
      anchor: { x: 2, y: 2, width: 20, height: 6 },
      figmaAnchor: { x: 2, y: 2, width: 20, height: 6 },
    });
  }

  return out;
}

function textMatchScore(f: FigmaText, s: SiteText, fh: number, vh: number): number {
  const a = f.text.toLowerCase().trim();
  const b = s.text.toLowerCase().trim();
  if (!a || !b) return 0;

  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (!longer.includes(shorter.slice(0, Math.min(20, shorter.length)))) return 0;

  const overlapLen = Math.min(20, shorter.length);
  const textScore = overlapLen / Math.max(longer.length, 1);

  const normDist = Math.abs(
    (s.rect.top + s.rect.height / 2) / vh -
      (f.rect.top + f.rect.height / 2) / fh
  );
  const positionScore = 1 - Math.min(1, normDist / 0.2);

  return textScore * 0.7 + positionScore * 0.3;
}

function auditTypography(
  figma: FigmaText[],
  site: SiteText[],
  vw: number,
  vh: number,
  fw: number,
  fh: number
): Discrepancy[] {
  const out: Discrepancy[] = [];
  const usedSite = new Set<SiteText>();

  for (const f of figma.slice(0, 60)) {
    if (!f.text || f.text.length < 4) continue;

    let best: SiteText | null = null;
    let bestScore = 0.45;

    for (const s of site) {
      if (usedSite.has(s)) continue;
      const score = textMatchScore(f, s, fh, vh);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }

    if (!best) continue;
    usedSite.add(best);

    const anchor = rectToAnchor(best.rect, vw, vh);
    const figmaAnchor = rectToAnchor(f.rect, fw, fh);
    const pairId = slug(f.name);

    const sizeDiff = best.fontSize - f.fontSize;
    if (Math.abs(sizeDiff) > TOLERANCE.fontSize) {
      out.push({
        id: `type-size-${pairId}`,
        category: "typography",
        name: f.name,
        property: "Font size",
        figma: `${f.fontSize}px`,
        site: `${best.fontSize}px`,
        delta: formatDelta(sizeDiff, "px"),
        severity: "error",
        anchor,
        figmaAnchor,
      });
    }

    if (best.fontWeight !== f.fontWeight) {
      out.push({
        id: `type-weight-${pairId}`,
        category: "typography",
        name: f.name,
        property: "Font weight",
        figma: String(f.fontWeight),
        site: String(best.fontWeight),
        delta: `${best.fontWeight - f.fontWeight >= 0 ? "+" : ""}${best.fontWeight - f.fontWeight}`,
        severity: "error",
        anchor,
        figmaAnchor,
      });
    }
  }

  return dedupe(out);
}

function auditImages(
  figma: FigmaImage[],
  site: LayoutSample["images"],
  vw: number,
  vh: number,
  fw: number,
  fh: number
): Discrepancy[] {
  const out: Discrepancy[] = [];
  const pairs = matchImages(figma, site, fh, vh);

  for (const { figma: f, site: s } of pairs) {
    const anchor = rectToAnchor(s.rect, vw, vh);
    const figmaAnchor = rectToAnchor(f.rect, fw, fh);
    const pairId = slug(`${f.name}-${s.label}`);

    const wDiff = s.rect.width - f.width;
    const hDiff = s.rect.height - f.height;

    if (Math.abs(wDiff) > TOLERANCE.image) {
      out.push({
        id: `img-w-${pairId}`,
        category: "image",
        name: f.name,
        property: "Image width",
        figma: `${f.width}px`,
        site: `${s.rect.width}px`,
        delta: formatDelta(wDiff, "px"),
        severity: Math.abs(wDiff) > 24 ? "error" : "warning",
        anchor,
        figmaAnchor,
      });
    }

    if (Math.abs(hDiff) > TOLERANCE.image) {
      out.push({
        id: `img-h-${pairId}`,
        category: "image",
        name: f.name,
        property: "Image height",
        figma: `${f.height}px`,
        site: `${s.rect.height}px`,
        delta: formatDelta(hDiff, "px"),
        severity: Math.abs(hDiff) > 24 ? "error" : "warning",
        anchor,
        figmaAnchor,
      });
    }
  }

  return out;
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
}

function formatDelta(diff: number, unit: string): string {
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff}${unit}`;
}

function dedupe(items: Discrepancy[]): Discrepancy[] {
  const seen = new Set<string>();
  return items.filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}
