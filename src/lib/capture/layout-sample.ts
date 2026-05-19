import type { Page } from "playwright";

export type ElementRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type SiteSection = {
  index: number;
  tag: string;
  label: string;
  rect: ElementRect;
  marginBottom: number;
  gapAfter: number | null;
};

export type SiteImage = {
  index: number;
  label: string;
  rect: ElementRect;
};

export type SiteText = {
  text: string;
  tag: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  lineHeight: number;
  rect: ElementRect;
};

export type LayoutSample = {
  viewportWidth: number;
  viewportHeight: number;
  sections: SiteSection[];
  images: SiteImage[];
  texts: SiteText[];
};

export async function samplePageLayout(page: Page): Promise<LayoutSample> {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return (
        r.height >= 48 &&
        r.width >= 100 &&
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

    const sectionCandidates = Array.from(
      document.querySelectorAll(
        "main section, main > div, main > article, body > section, [class*='section']"
      )
    ).filter(visible);

    const sections: SiteSection[] = (
      sectionCandidates.length
        ? sectionCandidates
        : Array.from(document.querySelectorAll("body *")).filter(visible)
    )
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height >= 80 && r.width >= 200;
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .slice(0, 20)
      .map((el, index, arr) => {
        const rect = toRect(el);
        const s = window.getComputedStyle(el);
        const marginBottom = parseFloat(s.marginBottom) || 0;
        const next = arr[index + 1];
        const gapAfter = next
          ? Math.round(next.getBoundingClientRect().top - rect.top - rect.height)
          : null;
        const label =
          el.getAttribute("aria-label") ||
          el.id ||
          (el.className && typeof el.className === "string"
            ? el.className.split(" ")[0]
            : "") ||
          el.tagName.toLowerCase();

        return {
          index,
          tag: el.tagName.toLowerCase(),
          label: label.slice(0, 60),
          rect,
          marginBottom: Math.round(marginBottom),
          gapAfter,
        };
      });

    const images: SiteImage[] = Array.from(document.querySelectorAll("img, picture img"))
      .filter(visible)
      .map((el) => {
        const rect = toRect(el);
        const img = el as HTMLImageElement;
        const alt = img.alt?.trim() || "";
        const src = img.currentSrc || img.src || "";
        const file =
          src
            .split("/")
            .pop()
            ?.split("?")[0]
            ?.replace(/\.[a-z0-9]+$/i, "") || "";
        const label = [alt, file].filter(Boolean).join(" ").slice(0, 80);
        return { rect, label: label || `img-${Math.round(rect.top)}` };
      })
      .filter(({ rect }) => rect.width >= 40 && rect.height >= 40)
      .sort((a, b) => a.rect.top - b.rect.top)
      .slice(0, 40)
      .map(({ rect, label }, index) => ({
        index,
        label,
        rect,
      }));

    const textEls = Array.from(
      document.querySelectorAll("h1, h2, h3, h4, p, span, a, li, button")
    )
      .filter(visible)
      .filter((el) => {
        const text = (el.textContent ?? "").trim();
        return text.length >= 4 && text.length < 200;
      })
      .slice(0, 80);

    const texts: SiteText[] = [];
    const seen = new Set<string>();

    for (const el of textEls) {
      const text = (el.textContent ?? "").trim().slice(0, 80);
      if (seen.has(text)) continue;
      seen.add(text);
      const s = window.getComputedStyle(el);
      const fontSize = parseFloat(s.fontSize);
      if (!fontSize) continue;
      texts.push({
        text,
        tag: el.tagName.toLowerCase(),
        fontSize: Math.round(fontSize),
        fontWeight: parseInt(s.fontWeight, 10) || 400,
        fontFamily: s.fontFamily,
        lineHeight: Math.round(parseFloat(s.lineHeight) || fontSize * 1.2),
        rect: toRect(el),
      });
    }

    return { viewportWidth, viewportHeight, sections, images, texts };
  });
}
