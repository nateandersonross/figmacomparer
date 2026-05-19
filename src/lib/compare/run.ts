import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { adjustmentsToCaptureOptions } from "@/lib/capture/adjustments";
import { FigmaClient } from "@/lib/figma/client";
import {
  extractImages,
  extractSections,
  extractTextStyles,
} from "@/lib/figma/extract-layout";
import {
  capturePage,
  closeBrowser,
  launchBrowser,
  resizePreviewToWidth,
} from "@/lib/capture/website";
import { runDesignAudit } from "@/lib/compare/design-audit";
import type { BreakpointResult, ComparisonConfig, ComparisonReport } from "@/lib/types";

const RESPONSIVE_WIDTHS = [768, 1024, 1280];

function buildBreakpointWidths(
  mobileWidth: number,
  desktopWidth: number,
  extra?: number[]
): Array<{ width: number; label: string; figmaSource: "mobile" | "desktop" }> {
  const widths = new Set<number>([mobileWidth, desktopWidth, ...RESPONSIVE_WIDTHS, ...(extra ?? [])]);

  return Array.from(widths)
    .sort((a, b) => a - b)
    .map((width) => {
      const isMobile = width === mobileWidth;
      return {
        width,
        figmaSource: isMobile ? ("mobile" as const) : ("desktop" as const),
        label: isMobile
          ? `Mobile (${width}px)`
          : `Responsive (${width}px) → desktop`,
      };
    });
}

export async function runComparison(config: ComparisonConfig): Promise<ComparisonReport> {
  const id = `cmp_${Date.now()}`;
  const outDir = path.join(process.cwd(), "public", "comparisons", id);
  await fs.mkdir(outDir, { recursive: true });

  const figma = new FigmaClient(config.figmaToken);
  const [mobileFrame, desktopFrame] = await Promise.all([
    figma.getFrame(config.figmaFileKey, config.mobileFrameId),
    figma.getFrame(config.figmaFileKey, config.desktopFrameId),
  ]);

  if (!mobileFrame?.absoluteBoundingBox) {
    throw new Error("Mobile frame not found or has no dimensions");
  }
  if (!desktopFrame?.absoluteBoundingBox) {
    throw new Error("Desktop frame not found or has no dimensions");
  }

  const mobileWidth = Math.round(mobileFrame.absoluteBoundingBox.width);
  const mobileHeight = Math.round(mobileFrame.absoluteBoundingBox.height);
  const desktopWidth = Math.round(desktopFrame.absoluteBoundingBox.width);
  const desktopHeight = Math.round(desktopFrame.absoluteBoundingBox.height);

  const breakpoints = buildBreakpointWidths(
    mobileWidth,
    desktopWidth,
    config.intermediateWidths
  );

  const figmaLayout = {
    mobile: {
      sections: extractSections(mobileFrame),
      images: extractImages(mobileFrame),
      texts: extractTextStyles(mobileFrame),
    },
    desktop: {
      sections: extractSections(desktopFrame),
      images: extractImages(desktopFrame),
      texts: extractTextStyles(desktopFrame),
    },
  };

  const localeBase = {
    locale: config.locale,
    acceptLanguage: config.acceptLanguage,
    timezoneId: config.timezoneId,
  };

  const results: BreakpointResult[] = [];
  const browser = await launchBrowser();

  try {
    for (const bp of breakpoints) {
      const isMobile = bp.figmaSource === "mobile";
      const frameId = isMobile ? config.mobileFrameId : config.desktopFrameId;
      const frameHeight = isMobile ? mobileHeight : desktopHeight;
      const layout = isMobile ? figmaLayout.mobile : figmaLayout.desktop;
      const adjustments = isMobile ? config.mobileAdjustments : config.desktopAdjustments;

      const [figmaRaw, pageCapture] = await Promise.all([
        figma.exportFramePng(config.figmaFileKey, frameId, bp.width),
        capturePage(
          browser,
          config.websiteUrl,
          bp.width,
          frameHeight,
          adjustmentsToCaptureOptions(adjustments, localeBase)
        ),
      ]);

      const [figmaPng, sitePng] = await Promise.all([
        resizePreviewToWidth(figmaRaw, bp.width),
        resizePreviewToWidth(pageCapture.screenshot, bp.width),
      ]);

      const siteMeta = await sharp(sitePng).metadata();
      const captureHeight = siteMeta.height ?? frameHeight;

      const audit = runDesignAudit(
        layout.sections,
        layout.images,
        layout.texts,
        {
          ...pageCapture.layout,
          viewportWidth: siteMeta.width ?? bp.width,
          viewportHeight: captureHeight,
        },
        { width: isMobile ? mobileWidth : desktopWidth, height: frameHeight }
      );

      const figmaPath = `/comparisons/${id}/${bp.width}-figma.png`;
      const sitePath = `/comparisons/${id}/${bp.width}-site.png`;

      await Promise.all([
        fs.writeFile(path.join(outDir, `${bp.width}-figma.png`), figmaPng),
        fs.writeFile(path.join(outDir, `${bp.width}-site.png`), sitePng),
      ]);

      results.push({
        width: bp.width,
        label: bp.label,
        figmaSource: bp.figmaSource,
        figmaPath,
        sitePath,
        captureHeight,
        audit,
      });
    }
  } finally {
    await closeBrowser(browser);
  }

  const allDisc = results.flatMap((r) => r.audit.discrepancies);

  const report: ComparisonReport = {
    id,
    createdAt: new Date().toISOString(),
    config: {
      figmaFileKey: config.figmaFileKey,
      mobileFrameId: config.mobileFrameId,
      desktopFrameId: config.desktopFrameId,
      websiteUrl: config.websiteUrl,
      intermediateWidths: config.intermediateWidths,
      locale: config.locale,
      acceptLanguage: config.acceptLanguage,
      mobileAdjustments: config.mobileAdjustments,
      desktopAdjustments: config.desktopAdjustments,
    },
    mobileWidth,
    desktopWidth,
    breakpoints: results,
    summary: {
      totalDiscrepancies: allDisc.length,
      typography: allDisc.filter((d) => d.category === "typography").length,
      spacing: allDisc.filter((d) => d.category === "spacing").length,
      image: allDisc.filter((d) => d.category === "image").length,
    },
  };

  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  return report;
}
