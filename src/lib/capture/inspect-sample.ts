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

    const NPP_RE = /\b(npp[-_][a-z]{2,5}\d{2,4})\b/i;
    const nppKey = (s: string | undefined | null) => {
      if (!s) return null;
      const m = NPP_RE.exec(s);
      return m ? m[1].toLowerCase().replace(/_/g, "-") : null;
    };

    const labelFor = (el: Element) => {
      const cls =
        el.className && typeof el.className === "string"
          ? el.className.split(/\s+/).filter(Boolean)
          : [];
      const npp = cls.map(nppKey).find(Boolean);
      if (npp) return npp;

      const aria = el.getAttribute("aria-label");
      const blockClass = cls.find((c) => /^block[_-]/i.test(c));
      const id = el.id ? `#${el.id}` : "";
      const firstClass = cls[0] ? `.${cls[0]}` : "";
      const text = (el.textContent ?? "").trim().slice(0, 40);
      return aria || blockClass || id || firstClass || text || el.tagName.toLowerCase();
    };

    const metricsFor = (el: Element, rect: { width: number; height: number }): InspectMetrics => {
      const s = window.getComputedStyle(el);
      return {
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
    };

    type Raw = {
      id: string;
      kind: string;
      label: string;
      tag: string;
      rect: { top: number; left: number; width: number; height: number };
      metrics: InspectMetrics;
    };

    const items: Raw[] = [];

    const sectionEls = Array.from(
      document.querySelectorAll<HTMLElement>(
        'section, article, [class*="block-"], [class*="block_"], [data-section]'
      )
    ).filter(visible);

    /** Keep only outermost layout blocks (drop inner divs whose class also matches `block-`). */
    const outerSections = sectionEls.filter(
      (el) => !sectionEls.some((other) => other !== el && other.contains(el))
    );

    outerSections.forEach((el, i) => {
      const rect = toRect(el);
      const tag = el.tagName.toLowerCase();
      items.push({
        id: `el-section-${i}`,
        kind: "section",
        label: labelFor(el).slice(0, 80),
        tag,
        rect,
        metrics: metricsFor(el, rect),
      });
    });

    const textEls = Array.from(
      document.querySelectorAll<HTMLElement>(
        "h1, h2, h3, h4, h5, h6, p, li, blockquote, [role='heading']"
      )
    ).filter((el) => visible(el) && (el.textContent ?? "").trim().length > 0);

    textEls.forEach((el, i) => {
      const rect = toRect(el);
      const tag = el.tagName.toLowerCase();
      items.push({
        id: `el-text-${i}-${tag}`,
        kind: "text",
        label: labelFor(el).slice(0, 80),
        tag,
        rect,
        metrics: metricsFor(el, rect),
      });
    });

    const imageEls = Array.from(
      document.querySelectorAll<HTMLElement>("img, picture, svg, video")
    ).filter(visible);

    imageEls.forEach((el, i) => {
      const rect = toRect(el);
      const tag = el.tagName.toLowerCase();
      items.push({
        id: `el-image-${i}-${tag}`,
        kind: "image",
        label: labelFor(el).slice(0, 80),
        tag,
        rect,
        metrics: metricsFor(el, rect),
      });
    });

    const interactiveEls = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a, [role="button"], [class*="btn"], [class*="button"]'
      )
    ).filter(visible);

    interactiveEls.forEach((el, i) => {
      const rect = toRect(el);
      const tag = el.tagName.toLowerCase();
      items.push({
        id: `el-button-${i}-${tag}`,
        kind: "element",
        label: labelFor(el).slice(0, 80),
        tag,
        rect,
        metrics: metricsFor(el, rect),
      });
    });

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

    items.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

    return { viewportWidth, viewportHeight, items };
  });

  const elements: InspectableElement[] = raw.items.map(({ kind, ...el }) => ({
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
  yPx: number,
  opts?: { preferSection?: boolean }
): InspectableElement | null {
  const preferSection = opts?.preferSection ?? true;

  const hits = elements.filter((el) => {
    const { top, left, width, height } = el.rect;
    return xPx >= left && xPx <= left + width && yPx >= top && yPx <= top + height;
  });

  if (hits.length === 0) return null;

  if (preferSection) {
    const sections = hits.filter((e) => e.kind === "section");
    if (sections.length > 0) {
      let best: InspectableElement = sections[0]!;
      let bestArea = best.rect.width * best.rect.height;
      for (const el of sections) {
        const area = el.rect.width * el.rect.height;
        if (area < bestArea) {
          bestArea = area;
          best = el;
        }
      }
      return best;
    }
  }

  let best: InspectableElement | null = null;
  let bestArea = Infinity;

  for (const el of hits) {
    const { width, height } = el.rect;
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
