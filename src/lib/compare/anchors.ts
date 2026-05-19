import type { ElementRect } from "@/lib/capture/layout-sample";
import type { DiscrepancyAnchor } from "@/lib/types";

export function rectToAnchor(
  rect: ElementRect,
  viewportWidth: number,
  viewportHeight: number
): DiscrepancyAnchor {
  const pct = (n: number, total: number) =>
    Math.round((n / total) * 1000) / 10;

  return {
    x: pct(rect.left, viewportWidth),
    y: pct(rect.top, viewportHeight),
    width: pct(rect.width, viewportWidth),
    height: pct(rect.height, viewportHeight),
  };
}

/** Pin between this section and the next (gap mismatch) */
export function gapAnchor(
  section: ElementRect,
  gapPx: number,
  viewportWidth: number,
  viewportHeight: number
): DiscrepancyAnchor {
  const h = Math.min(Math.max(gapPx, 12), 48);
  return rectToAnchor(
    {
      top: section.top + section.height,
      left: Math.max(0, section.left + section.width / 2 - 24),
      width: 48,
      height: h,
    },
    viewportWidth,
    viewportHeight
  );
}
