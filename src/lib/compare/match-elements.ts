import type { ElementRect } from "@/lib/capture/layout-sample";
import type { FigmaImage, FigmaSection } from "@/lib/figma/extract-layout";
import type { SiteImage, SiteSection } from "@/lib/capture/layout-sample";

export type ElementPair<F, S> = {
  figma: F;
  site: S;
  score: number;
};

const MIN_MATCH_SCORE = 0.42;

/** Tokenize names for fuzzy label matching */
export function nameTokens(...parts: string[]): Set<string> {
  const tokens = new Set<string>();
  for (const part of parts) {
    for (const t of part.toLowerCase().split(/[^a-z0-9]+/)) {
      if (t.length >= 3) tokens.add(t);
    }
  }
  return tokens;
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) {
    if (b.has(t)) shared++;
  }
  return shared / Math.max(a.size, b.size);
}

function centerY(rect: ElementRect): number {
  return rect.top + rect.height / 2;
}

function normY(rect: ElementRect, pageHeight: number): number {
  return pageHeight > 0 ? centerY(rect) / pageHeight : 0;
}

function verticalOverlap(a: ElementRect, b: ElementRect): number {
  const aBot = a.top + a.height;
  const bBot = b.top + b.height;
  const overlap = Math.min(aBot, bBot) - Math.max(a.top, b.top);
  if (overlap <= 0) return 0;
  return overlap / Math.min(a.height, b.height);
}

function sizeSimilarity(
  figmaW: number,
  figmaH: number,
  siteW: number,
  siteH: number
): number {
  const wRatio = siteW / Math.max(figmaW, 1);
  const hRatio = siteH / Math.max(figmaH, 1);
  const wScore = 1 - Math.min(1, Math.abs(wRatio - 1));
  const hScore = 1 - Math.min(1, Math.abs(hRatio - 1));
  return (wScore + hScore) / 2;
}

function estimateYOffset(
  figma: { rect: ElementRect }[],
  site: { rect: ElementRect }[],
  figmaHeight: number,
  siteHeight: number
): number {
  const offsets: number[] = [];
  for (const s of site.slice(0, 8)) {
    let bestDist = Infinity;
    let bestOffset = 0;
    const sNorm = normY(s.rect, siteHeight);
    for (const f of figma) {
      const dist = Math.abs(sNorm - normY(f.rect, figmaHeight));
      if (dist < bestDist && dist < 0.12) {
        bestDist = dist;
        bestOffset = s.rect.top - f.rect.top;
      }
    }
    if (bestDist < Infinity) offsets.push(bestOffset);
  }
  if (!offsets.length) return 0;
  offsets.sort((a, b) => a - b);
  return offsets[Math.floor(offsets.length / 2)];
}

function scoreSectionPair(
  f: FigmaSection,
  s: SiteSection,
  yOffset: number,
  figmaHeight: number,
  siteHeight: number
): number {
  const fTokens = nameTokens(f.name, s.label, s.tag);
  const sTokens = nameTokens(s.label, s.tag);
  const nameScore = tokenOverlap(fTokens, sTokens);

  const adjustedFigmaTop = f.rect.top + yOffset;
  const positionScore =
    1 -
    Math.min(
      1,
      Math.abs(s.rect.top - adjustedFigmaTop) / Math.max(siteHeight * 0.12, 48)
    );

  const normScore =
    1 - Math.min(1, Math.abs(normY(s.rect, siteHeight) - normY(f.rect, figmaHeight)) / 0.18);

  const overlapScore = verticalOverlap(
    { ...f.rect, top: adjustedFigmaTop },
    s.rect
  );

  const sizeScore = sizeSimilarity(f.width, f.height, s.rect.width, s.rect.height);

  return (
    positionScore * 0.35 +
    normScore * 0.25 +
    overlapScore * 0.2 +
    sizeScore * 0.1 +
    nameScore * 0.1
  );
}

function scoreImagePair(
  f: FigmaImage,
  s: SiteImage,
  yOffset: number,
  figmaHeight: number,
  siteHeight: number
): number {
  const fTokens = nameTokens(f.name, s.label);
  const sTokens = nameTokens(s.label);
  const nameScore = tokenOverlap(fTokens, sTokens);

  const adjustedFigmaTop = f.rect.top + yOffset;
  const positionScore =
    1 -
    Math.min(
      1,
      Math.abs(s.rect.top - adjustedFigmaTop) / Math.max(siteHeight * 0.1, 40)
    );

  const normScore =
    1 - Math.min(1, Math.abs(normY(s.rect, siteHeight) - normY(f.rect, figmaHeight)) / 0.15);

  const overlapScore = verticalOverlap(
    { ...f.rect, top: adjustedFigmaTop },
    s.rect
  );

  const sizeScore = sizeSimilarity(f.width, f.height, s.rect.width, s.rect.height);

  // Strong penalty when sizes are wildly different (likely wrong pairing)
  if (sizeScore < 0.35 && nameScore < 0.2) return 0;

  return (
    positionScore * 0.3 +
    normScore * 0.3 +
    overlapScore * 0.25 +
    sizeScore * 0.1 +
    nameScore * 0.05
  );
}

function greedyMatch<F, S>(
  figma: F[],
  site: S[],
  scoreFn: (f: F, s: S) => number,
  minScore = MIN_MATCH_SCORE
): ElementPair<F, S>[] {
  const siteSorted = [...site].sort((a, b) => {
    const aTop = (a as { rect: ElementRect }).rect.top;
    const bTop = (b as { rect: ElementRect }).rect.top;
    return aTop - bTop;
  });

  const usedFigma = new Set<number>();
  const pairs: ElementPair<F, S>[] = [];

  for (const s of siteSorted) {
    let bestIdx = -1;
    let bestScore = minScore;

    for (let i = 0; i < figma.length; i++) {
      if (usedFigma.has(i)) continue;
      const score = scoreFn(figma[i], s);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      usedFigma.add(bestIdx);
      pairs.push({ figma: figma[bestIdx], site: s, score: bestScore });
    }
  }

  return pairs;
}

export function matchSections(
  figma: FigmaSection[],
  site: SiteSection[],
  figmaHeight: number,
  siteHeight: number
): ElementPair<FigmaSection, SiteSection>[] {
  if (!figma.length || !site.length) return [];

  const yOffset = estimateYOffset(figma, site, figmaHeight, siteHeight);

  return greedyMatch(figma, site, (f, s) =>
    scoreSectionPair(f, s, yOffset, figmaHeight, siteHeight)
  );
}

export function matchImages(
  figma: FigmaImage[],
  site: SiteImage[],
  figmaHeight: number,
  siteHeight: number
): ElementPair<FigmaImage, SiteImage>[] {
  if (!figma.length || !site.length) return [];

  const yOffset = estimateYOffset(figma, site, figmaHeight, siteHeight);

  // Prefer content-sized images — drop tiny icons from site list for matching
  const siteContent = site.filter(
    (img) => img.rect.width >= 64 && img.rect.height >= 64
  );
  const figmaContent = figma.filter(
    (img) => img.rect.width >= 64 && img.rect.height >= 64
  );

  return greedyMatch(
    figmaContent.length ? figmaContent : figma,
    siteContent.length ? siteContent : site,
    (f, s) => scoreImagePair(f, s, yOffset, figmaHeight, siteHeight),
    0.45
  );
}
