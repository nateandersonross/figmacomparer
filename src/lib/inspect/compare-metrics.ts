import type { InspectMetrics } from "@/lib/types/inspect";

const PX_TOLERANCE = 1;

/** Property keys used by the inspector UI for highlight + flagging. */
export type MetricPropertyKey = string;

function parsePx(value: string | undefined | null): number | null {
  if (value == null || value === "—") return null;
  const m = String(value).trim().match(/^(-?[\d.]+)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

function pxEqual(a: string | undefined, b: string | undefined, tolerance = PX_TOLERANCE): boolean {
  const pa = parsePx(a);
  const pb = parsePx(b);
  if (pa == null && pb == null) return true;
  if (pa == null || pb == null) return false;
  return Math.abs(pa - pb) <= tolerance;
}

function numEqual(a: number | null | undefined, b: number | null | undefined, tolerance = PX_TOLERANCE): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
}

function fontWeightEqual(a: string | undefined, b: string | undefined): boolean {
  const pa = parsePx(a) ?? (a ? parseInt(a, 10) : null);
  const pb = parsePx(b) ?? (b ? parseInt(b, 10) : null);
  if (pa == null && pb == null) return true;
  if (pa == null || pb == null) return false;
  return pa === pb;
}

function fontFamilyEqual(a: string | undefined, b: string | undefined): boolean {
  const norm = (s: string | undefined) =>
    (s ?? "")
      .toLowerCase()
      .split(",")[0]
      .replace(/['"]/g, "")
      .trim();
  const fa = norm(a);
  const fb = norm(b);
  if (!fa || !fb) return fa === fb;
  return fa === fb || fa.includes(fb) || fb.includes(fa);
}

/** Compare Figma vs site metrics; returns property keys that differ. */
export function compareMetrics(
  figma: InspectMetrics,
  site: InspectMetrics
): Set<MetricPropertyKey> {
  const d = new Set<MetricPropertyKey>();

  if (!numEqual(figma.width, site.width) || !numEqual(figma.height, site.height)) {
    d.add("size");
  }

  if (figma.gap != null || site.gap != null) {
    if (!pxEqual(figma.gap, site.gap)) d.add("gap");
  }

  if (!numEqual(figma.gapAfter, site.gapAfter)) {
    d.add("gap-after");
  }

  for (const side of ["top", "right", "bottom", "left"] as const) {
    if (!pxEqual(figma.padding[side], site.padding[side])) {
      d.add(`padding-${side}`);
    }
  }

  for (const side of ["top", "right", "bottom", "left"] as const) {
    if (!pxEqual(figma.margin[side], site.margin[side])) {
      d.add(`margin-${side}`);
    }
  }

  if (figma.fontSize || site.fontSize) {
    if (!pxEqual(figma.fontSize, site.fontSize)) d.add("font-size");
  }

  if (figma.fontWeight || site.fontWeight) {
    if (!fontWeightEqual(figma.fontWeight, site.fontWeight)) d.add("font-weight");
  }

  if (figma.lineHeight || site.lineHeight) {
    if (!pxEqual(figma.lineHeight, site.lineHeight)) d.add("line-height");
  }

  if (figma.fontFamily || site.fontFamily) {
    if (!fontFamilyEqual(figma.fontFamily, site.fontFamily)) d.add("font-family");
  }

  return d;
}
