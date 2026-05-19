import type { FigmaNode } from "@/lib/figma/client";
import { getFrameBox } from "@/lib/figma/extract-layout";
import type { InspectableElement, InspectMetrics } from "@/lib/types/inspect";

const MIN_SIZE = 4;
const MAX_DEPTH = 20;
const SECTION_TYPES = new Set([
  "FRAME",
  "GROUP",
  "COMPONENT",
  "INSTANCE",
  "SECTION",
  "COMPONENT_SET",
]);

function px(n: number | undefined | null): string {
  return `${Math.round(n ?? 0)}px`;
}

function kindFor(node: FigmaNode): InspectableElement["kind"] {
  if (node.type === "TEXT") return "text";
  const hasImage = node.fills?.some((f) => f.type === "IMAGE");
  if (hasImage || /image|photo|hero|banner|thumb/i.test(node.name)) return "image";
  if (SECTION_TYPES.has(node.type)) return "section";
  return "element";
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

/** Walk Figma frame tree into click-to-inspect elements (frame-local coordinates). */
export function extractInspectableFromFigma(root: FigmaNode): InspectableElement[] {
  const frame = getFrameBox(root);
  const items: InspectableElement[] = [];

  function walk(node: FigmaNode, depth: number) {
    if (depth > MAX_DEPTH) return;
    const box = node.absoluteBoundingBox;
    const tooSmall = !box || box.width < MIN_SIZE || box.height < MIN_SIZE;
    const isText = node.type === "TEXT";

    if (!tooSmall && node.id !== root.id) {
      const rect = {
        top: Math.round(box!.y - frame.y),
        left: Math.round(box!.x - frame.x),
        width: Math.round(box!.width),
        height: Math.round(box!.height),
      };

      items.push({
        id: `figma_${node.id}`,
        kind: kindFor(node),
        label: node.name,
        tag: node.type,
        rect,
        metrics: metricsFor(node),
      });
    }

    if (isText) return;
    for (const child of node.children ?? []) walk(child, depth + 1);
  }

  walk(root, 0);

  const sorted = items.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    const curBottom = cur.rect.top + cur.rect.height;
    if (next.rect.top >= curBottom - 2) {
      cur.metrics.gapAfter = Math.round(next.rect.top - curBottom);
    }
  }

  return sorted.slice(0, 600);
}
