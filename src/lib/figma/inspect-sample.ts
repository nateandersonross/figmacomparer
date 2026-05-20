import type { FigmaNode } from "@/lib/figma/client";
import { getFrameBox } from "@/lib/figma/extract-layout";
import type { InspectableElement, InspectMetrics } from "@/lib/types/inspect";

const MIN_SIZE = 4;
const MIN_ELEMENT_SIZE = 8;
const MAX_DEPTH = 20;
const SECTION_TYPES = new Set([
  "FRAME",
  "GROUP",
  "COMPONENT",
  "INSTANCE",
  "SECTION",
  "COMPONENT_SET",
]);
const SKIP_INNER_TYPES = new Set(["DOCUMENT", "CANVAS", "PAGE"]);

function px(n: number | undefined | null): string {
  return `${Math.round(n ?? 0)}px`;
}

function isImageNode(node: FigmaNode): boolean {
  const hasImage = node.fills?.some((f) => f.type === "IMAGE");
  return Boolean(hasImage) || /image|photo|hero|banner|thumb|logo|icon/i.test(node.name);
}

/**
 * Matches WordPress-style block names like `NPP-HR001`, `NPP_TXT002`, `npp-log001`, etc.
 * Returns the normalized key (e.g. `npp-hr001`) or null.
 */
const NPP_NAME_RE = /\b(npp[-_][a-z]{2,5}\d{2,4})\b/i;
export function nppSectionKey(name: string | undefined | null): string | null {
  if (!name) return null;
  const match = NPP_NAME_RE.exec(name);
  if (!match) return null;
  return match[1].toLowerCase().replace(/_/g, "-");
}

type Typography = {
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  lineHeight?: string;
  letterSpacing?: string;
  /** font size as number, used to pick the largest descendant */
  fontSizePx: number;
};

function typographyFromNode(node: FigmaNode): Typography | null {
  const s = node.style;
  if (!s?.fontSize) return null;
  return {
    fontSize: `${Math.round(s.fontSize)}px`,
    fontWeight: String(s.fontWeight ?? 400),
    fontFamily: s.fontFamily ?? "unknown",
    lineHeight: s.lineHeightPx ? `${Math.round(s.lineHeightPx)}px` : undefined,
    letterSpacing: s.letterSpacing != null ? `${s.letterSpacing}px` : undefined,
    fontSizePx: s.fontSize,
  };
}

/** Pick the dominant typography from a node — itself if TEXT, otherwise its largest TEXT descendant. */
function dominantTypography(node: FigmaNode): Typography | null {
  let best: Typography | null = typographyFromNode(node);

  function walk(n: FigmaNode, depth: number) {
    if (depth > MAX_DEPTH) return;
    if (n.type === "TEXT") {
      const t = typographyFromNode(n);
      if (t && (!best || t.fontSizePx > best.fontSizePx)) best = t;
    }
    for (const child of n.children ?? []) walk(child, depth + 1);
  }

  for (const child of node.children ?? []) walk(child, 0);
  return best;
}

function metricsFor(node: FigmaNode): InspectMetrics {
  const box = node.absoluteBoundingBox;
  const w = Math.round(box?.width ?? 0);
  const h = Math.round(box?.height ?? 0);

  const padding = {
    top: px(node.paddingTop),
    right: px(node.paddingRight),
    bottom: px(node.paddingBottom),
    left: px(node.paddingLeft),
  };

  const margin = { top: "0px", right: "0px", bottom: "0px", left: "0px" };

  const metrics: InspectMetrics = {
    width: w,
    height: h,
    margin,
    padding,
    gapAfter: null,
  };

  if (node.itemSpacing != null) {
    metrics.gap = `${node.itemSpacing}px`;
  }

  const typo = dominantTypography(node);
  if (typo) {
    metrics.fontSize = typo.fontSize;
    metrics.fontWeight = typo.fontWeight;
    metrics.fontFamily = typo.fontFamily;
    metrics.lineHeight = typo.lineHeight;
    metrics.letterSpacing = typo.letterSpacing;
  }

  return metrics;
}

/** Unwrap single-child GROUP/FRAME chains that span ~the full artboard (common Figma pattern). */
function effectiveSectionChildren(artboard: FigmaNode): FigmaNode[] {
  const artBox = artboard.absoluteBoundingBox;
  if (!artBox) return [];

  let layer: FigmaNode = artboard;
  for (let guard = 0; guard < 8; guard++) {
    const kids = layer.children ?? [];
    if (kids.length !== 1) break;
    const only = kids[0];
    if (!SECTION_TYPES.has(only.type)) break;
    const box = only.absoluteBoundingBox;
    if (!box) break;
    const wRatio = box.width / artBox.width;
    const hRatio = box.height / artBox.height;
    if (wRatio < 0.82 || hRatio < 0.82) break;
    layer = only;
  }

  return (layer.children ?? []).filter((c) => SECTION_TYPES.has(c.type));
}

function makeItem(
  node: FigmaNode,
  kind: InspectableElement["kind"],
  frame: { x: number; y: number }
): InspectableElement | null {
  const box = node.absoluteBoundingBox;
  if (!box || box.width < MIN_SIZE || box.height < MIN_SIZE) return null;

  const key = nppSectionKey(node.name);
  const label = key ?? node.name;

  return {
    id: `figma_${node.id}`,
    kind,
    label,
    tag: node.type,
    rect: {
      top: Math.round(box.y - frame.y),
      left: Math.round(box.x - frame.x),
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
    metrics: metricsFor(node),
  };
}

/** Walk the tree and return every node whose name matches the NPP-xxx pattern. */
function findNppSections(root: FigmaNode): FigmaNode[] {
  const found: FigmaNode[] = [];

  function walk(node: FigmaNode, depth: number) {
    if (depth > MAX_DEPTH) return;
    if (node.id !== root.id && nppSectionKey(node.name)) {
      found.push(node);
      return;
    }
    for (const child of node.children ?? []) walk(child, depth + 1);
  }

  walk(root, 0);
  return found;
}

/**
 * Walk Figma frame tree into click-to-inspect elements (frame-local coordinates).
 *
 * Rules:
 * - SECTIONS: prefer nodes whose name matches `NPP-xxx` at any depth — these align
 *   with WordPress block classes like `block_NPP-HR001`. Falls back to one-layer-deep
 *   children (after unwrapping full-size wrappers) when no NPP nodes are found.
 * - TEXT and IMAGE elements: included from any depth (for typography/size inspection).
 * - Intermediate container nodes are skipped so hit-testing stays clean.
 */
export function extractInspectableFromFigma(root: FigmaNode): InspectableElement[] {
  const frame = getFrameBox(root);
  const items: InspectableElement[] = [];

  function collectInner(node: FigmaNode, depth: number) {
    if (depth > MAX_DEPTH) return;
    if (SKIP_INNER_TYPES.has(node.type)) {
      for (const child of node.children ?? []) collectInner(child, depth + 1);
      return;
    }

    const box = node.absoluteBoundingBox;

    if (node.type === "TEXT") {
      const item = makeItem(node, "text", frame);
      if (item) items.push(item);
      return;
    }

    if (isImageNode(node)) {
      const item = makeItem(node, "image", frame);
      if (item) items.push(item);
    } else if (
      box &&
      box.width >= MIN_ELEMENT_SIZE &&
      box.height >= MIN_ELEMENT_SIZE
    ) {
      const item = makeItem(node, "element", frame);
      if (item) items.push(item);
    }

    for (const child of node.children ?? []) collectInner(child, depth + 1);
  }

  let sectionRoots = findNppSections(root);

  if (sectionRoots.length === 0) {
    sectionRoots = effectiveSectionChildren(root);
  }

  if (sectionRoots.length === 0) {
    sectionRoots = (root.children ?? []).filter((c) => SECTION_TYPES.has(c.type));
  }

  for (const child of sectionRoots) {
    const section = makeItem(child, "section", frame);
    if (section) items.push(section);

    for (const grand of child.children ?? []) collectInner(grand, 1);
  }

  const sections = items
    .filter((i) => i.kind === "section")
    .sort((a, b) => a.rect.top - b.rect.top);

  for (let i = 0; i < sections.length - 1; i++) {
    const cur = sections[i];
    const next = sections[i + 1];
    const curBottom = cur.rect.top + cur.rect.height;
    if (next.rect.top >= curBottom - 2) {
      cur.metrics.gapAfter = Math.round(next.rect.top - curBottom);
    }
  }

  const sorted = items.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  return sorted.slice(0, 600);
}
