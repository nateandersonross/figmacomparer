import type { Page } from "playwright";
import type { InspectableElement, InspectMetrics } from "@/lib/types/inspect";

export type InspectSample = {
  viewportWidth: number;
  viewportHeight: number;
  elements: InspectableElement[];
};

export async function sampleInspectableElements(page: Page): Promise<InspectSample> {
  const raw = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return (
        r.width >= 8 &&
        r.height >= 8 &&
        s.display !== "none" &&
        s.visibility !== "hidden" &&
        parseFloat(s.opacity) > 0.05
      );
    };

    const toRect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };

    const sides = (s: CSSStyleDeclaration, prefix: "margin" | "padding") => ({
      top: s[`${prefix}Top` as keyof CSSStyleDeclaration] as string,
      right: s[`${prefix}Right` as keyof CSSStyleDeclaration] as string,
      bottom: s[`${prefix}Bottom` as keyof CSSStyleDeclaration] as string,
      left: s[`${prefix}Left` as keyof CSSStyleDeclaration] as string,
    });

    const labelFor = (el: Element) => {
      const aria = el.getAttribute("aria-label");
      const id = el.id ? `#${el.id}` : "";
      const cls =
        el.className && typeof el.className === "string"
          ? `.${el.className.split(/\s+/)[0]}`
          : "";
      const text = (el.textContent ?? "").trim().slice(0, 40);
      return aria || id || cls || text || el.tagName.toLowerCase();
    };

    const kindFor = (el: Element, tag: string): string => {
      if (tag === "img" || tag === "picture") return "image";
      if (/^h[1-6]$/.test(tag) || tag === "p" || (tag === "span" && (el.textContent ?? "").trim().length > 3))
        return "text";
      if (tag === "section" || el.getAttribute("data-section")) return "section";
      const r = el.getBoundingClientRect();
      if (r.height >= 80 && r.width >= viewportWidth * 0.5) return "section";
      return "element";
    };

    const candidates = Array.from(
      document.querySelectorAll(
        "main *, body > *, section, article, img, picture, h1, h2, h3, h4, h5, h6, p, button, a"
      )
    ).filter(visible);

    const items: Array<{
      id: string;
      kind: string;
      label: string;
      tag: string;
      rect: { top: number; left: number; width: number; height: number };
      metrics: InspectMetrics;
      area: number;
    }> = [];

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const rect = toRect(el);
      const s = window.getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      const kind = kindFor(el, tag);

      const metrics: InspectMetrics = {
        width: rect.width,
        height: rect.height,
        margin: sides(s, "margin"),
        padding: sides(s, "padding"),
        gap: s.gap !== "normal" ? s.gap : undefined,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        fontFamily: s.fontFamily,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        color: s.color,
        gapAfter: null,
      };

      items.push({
        id: `el-${i}-${tag}`,
        kind,
        label: labelFor(el).slice(0, 80),
        tag,
        rect,
        metrics,
        area: rect.width * rect.height,
      });
    }

    items.sort((a, b) => a.rect.top - b.rect.top);

    for (let i = 0; i < items.length; i++) {
      const cur = items[i];
      const next = items[i + 1];
      if (!next) continue;
      const curBottom = cur.rect.top + cur.rect.height;
      if (next.rect.top >= curBottom - 2) {
        cur.metrics.gapAfter = Math.round(next.rect.top - curBottom);
      }
    }

    return { viewportWidth, viewportHeight, items };
  });

  const elements: InspectableElement[] = raw.items.map(({ area: _a, kind, ...el }) => ({
    ...el,
    kind: kind as InspectableElement["kind"],
  }));

  return {
    viewportWidth: raw.viewportWidth,
    viewportHeight: raw.viewportHeight,
    elements,
  };
}

/** Smallest element containing point — for click-to-inspect */
export function hitTestElement(
  elements: InspectableElement[],
  xPx: number,
  yPx: number
): InspectableElement | null {
  let best: InspectableElement | null = null;
  let bestArea = Infinity;

  for (const el of elements) {
    const { top, left, width, height } = el.rect;
    if (xPx < left || xPx > left + width || yPx < top || yPx > top + height) continue;
    const area = width * height;
    if (area < bestArea) {
      bestArea = area;
      best = el;
    }
  }

  return best;
}

export function rectToPercentAnchor(
  rect: InspectableElement["rect"],
  viewportWidth: number,
  viewportHeight: number
) {
  const pct = (n: number, total: number) =>
    Math.round((n / total) * 1000) / 10;

  return {
    x: pct(rect.left, viewportWidth),
    y: pct(rect.top, viewportHeight),
    width: pct(rect.width, viewportWidth),
    height: pct(rect.height, viewportHeight),
  };
}
