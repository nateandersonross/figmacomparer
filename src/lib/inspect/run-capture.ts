import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { adjustmentsToCaptureOptions } from "@/lib/capture/adjustments";
import {
  captureForInspect,
  closeBrowser,
  launchBrowser,
  resizePreviewToWidth,
} from "@/lib/capture/website";
import { FigmaClient } from "@/lib/figma/client";
import { extractInspectableFromFigma } from "@/lib/figma/inspect-sample";
import { DESKTOP_DEFAULT_WIDTH } from "@/lib/inspect/constants";
import type { InspectBreakpoint, InspectionSession } from "@/lib/types/inspect";
import type { SiteAdjustments } from "@/lib/types";

export type InspectCaptureConfig = {
  figmaToken: string;
  figmaFileKey: string;
  mobileFrameId: string;
  desktopFrameId: string;
  websiteUrl: string;
  locale?: string;
  acceptLanguage?: string;
  timezoneId?: string;
  mobileAdjustments?: SiteAdjustments;
  desktopAdjustments?: SiteAdjustments;
};

const RESPONSIVE_WIDTHS = [768, 1024, 1280, DESKTOP_DEFAULT_WIDTH];

export async function runInspectionCapture(
  config: InspectCaptureConfig
): Promise<InspectionSession> {
  const id = `insp_${Date.now()}`;
  const outDir = path.join(process.cwd(), "public", "comparisons", id);
  await fs.mkdir(outDir, { recursive: true });

  const figma = new FigmaClient(config.figmaToken);
  const [mobileFrame, desktopFrame] = await Promise.all([
    figma.getFrame(config.figmaFileKey, config.mobileFrameId),
    figma.getFrame(config.figmaFileKey, config.desktopFrameId),
  ]);

  if (!mobileFrame?.absoluteBoundingBox || !desktopFrame?.absoluteBoundingBox) {
    throw new Error("Mobile or desktop frame not found");
  }

  const mobileWidth = Math.round(mobileFrame.absoluteBoundingBox.width);
  const mobileHeight = Math.round(mobileFrame.absoluteBoundingBox.height);
  const desktopWidth = Math.round(desktopFrame.absoluteBoundingBox.width);
  const desktopHeight = Math.round(desktopFrame.absoluteBoundingBox.height);

  const localeBase = {
    locale: config.locale,
    acceptLanguage: config.acceptLanguage,
    timezoneId: config.timezoneId,
  };

  const widths = Array.from(
    new Set([mobileWidth, desktopWidth, ...RESPONSIVE_WIDTHS])
  ).sort((a, b) => a - b);

  const breakpoints: InspectBreakpoint[] = [];
  const browser = await launchBrowser();

  try {
    for (const width of widths) {
      const isMobile = width === mobileWidth;
      const frameId = isMobile ? config.mobileFrameId : config.desktopFrameId;
      const frameHeight = isMobile ? mobileHeight : desktopHeight;
      const adjustments = isMobile ? config.mobileAdjustments : config.desktopAdjustments;

      const [figmaRaw, capture] = await Promise.all([
        figma.exportFramePng(config.figmaFileKey, frameId, width),
        captureForInspect(
          browser,
          config.websiteUrl,
          width,
          frameHeight,
          adjustmentsToCaptureOptions(adjustments, localeBase)
        ),
      ]);

      const [figmaPng, sitePng] = await Promise.all([
        resizePreviewToWidth(figmaRaw, width),
        resizePreviewToWidth(capture.screenshot, width),
      ]);

      const [siteMeta, figmaMeta] = await Promise.all([
        sharp(sitePng).metadata(),
        sharp(figmaPng).metadata(),
      ]);
      const viewportHeight = siteMeta.height ?? frameHeight;
      const viewportWidth = siteMeta.width ?? width;
      const figmaViewportWidth = figmaMeta.width ?? width;
      const figmaViewportHeight = figmaMeta.height ?? frameHeight;

      const frameNode = isMobile ? mobileFrame : desktopFrame;
      const frameBox = frameNode.absoluteBoundingBox!;
      const figmaScaleX = figmaViewportWidth / frameBox.width;
      const figmaScaleY = figmaViewportHeight / frameBox.height;
      const figmaElements = extractInspectableFromFigma(frameNode).map((el) => ({
        ...el,
        rect: {
          top: Math.round(el.rect.top * figmaScaleY),
          left: Math.round(el.rect.left * figmaScaleX),
          width: Math.max(1, Math.round(el.rect.width * figmaScaleX)),
          height: Math.max(1, Math.round(el.rect.height * figmaScaleY)),
        },
      }));

      const figmaPath = `/comparisons/${id}/${width}-figma.png`;
      const sitePath = `/comparisons/${id}/${width}-site.png`;

      await Promise.all([
        fs.writeFile(path.join(outDir, `${width}-figma.png`), figmaPng),
        fs.writeFile(path.join(outDir, `${width}-site.png`), sitePng),
      ]);

      const isDefaultMobile = width === mobileWidth;
      const isDefaultDesktop = width === DESKTOP_DEFAULT_WIDTH;
      let label: string;
      if (isDefaultMobile) label = `Mobile (${width}px)`;
      else if (isDefaultDesktop) label = `Desktop (${width}px)`;
      else label = `Responsive (${width}px)`;

      breakpoints.push({
        width,
        label,
        figmaSource: isMobile ? "mobile" : "desktop",
        figmaPath,
        sitePath,
        viewportWidth,
        viewportHeight,
        figmaViewportWidth,
        figmaViewportHeight,
        elements: capture.inspect.elements,
        figmaElements,
        isDefaultMobile,
        isDefaultDesktop,
      });
    }
  } finally {
    await closeBrowser(browser);
  }

  const session: InspectionSession = {
    id,
    createdAt: new Date().toISOString(),
    websiteUrl: config.websiteUrl,
    figmaFileKey: config.figmaFileKey,
    mobileFrameId: config.mobileFrameId,
    desktopFrameId: config.desktopFrameId,
    breakpoints,
    issues: [],
  };

  await fs.writeFile(path.join(outDir, "session.json"), JSON.stringify(session, null, 2));
  return session;
}
