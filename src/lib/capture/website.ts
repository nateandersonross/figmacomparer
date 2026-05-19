import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";
import sharp from "sharp";
import { cropImage } from "@/lib/capture/image-adjust";
import { sampleInspectableElements, type InspectSample } from "@/lib/capture/inspect-sample";
import { samplePageLayout, type LayoutSample } from "@/lib/capture/layout-sample";
import {
  DEFAULT_CAPTURE_OPTIONS,
  type CaptureOptions,
} from "@/lib/capture/options";

export type PageCapture = {
  screenshot: Buffer;
  layout: LayoutSample;
};

export type InspectCapture = {
  screenshot: Buffer;
  inspect: InspectSample;
};

function buildContextOptions(
  width: number,
  height: number,
  options: CaptureOptions
): BrowserContextOptions {
  const locale = options.locale ?? DEFAULT_CAPTURE_OPTIONS.locale;
  const acceptLanguage =
    options.acceptLanguage ?? DEFAULT_CAPTURE_OPTIONS.acceptLanguage;
  const timezoneId = options.timezoneId ?? DEFAULT_CAPTURE_OPTIONS.timezoneId;

  return {
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale,
    timezoneId,
    geolocation: { latitude: 40.7128, longitude: -74.006 },
    permissions: ["geolocation"],
    extraHTTPHeaders: {
      "Accept-Language": acceptLanguage,
    },
  };
}

async function hideElements(page: Page, selectors?: string[]): Promise<void> {
  const list = (selectors ?? []).map((s) => s.trim()).filter(Boolean);
  if (!list.length) return;

  await page.addStyleTag({
    content: `
      ${list.join(", ")} {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        min-height: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
      }
    `,
  });

  await page.waitForTimeout(300);
}

async function loadPage(page: Page, url: string): Promise<void> {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  if (!response) {
    throw new Error(`Failed to load ${url} — no response`);
  }
  if (response.status() >= 400) {
    throw new Error(`Failed to load ${url} — HTTP ${response.status()}`);
  }

  await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(750);
}

async function applySiteCrops(
  screenshot: Buffer,
  options: CaptureOptions
): Promise<Buffer> {
  let result = screenshot;
  if (options.siteCropTop || options.siteCropBottom) {
    result = await cropImage(result, {
      top: options.siteCropTop,
      bottom: options.siteCropBottom,
    });
  }
  return result;
}

/** One browser visit: screenshot + layout measurements */
/** Screenshot + inspectable element tree for manual inspection */
export async function captureForInspect(
  browser: Browser,
  url: string,
  width: number,
  height: number,
  options: CaptureOptions = {}
): Promise<InspectCapture> {
  const context = await browser.newContext(buildContextOptions(width, height, options));
  const page = await context.newPage();

  try {
    await loadPage(page, url);
    await hideElements(page, options.hideSelectors ?? []);

    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    const inspect = await sampleInspectableElements(page);
    const adjusted = await applySiteCrops(Buffer.from(screenshot), options);

    return { screenshot: adjusted, inspect };
  } finally {
    await context.close().catch(() => {});
  }
}

export async function capturePage(
  browser: Browser,
  url: string,
  width: number,
  height: number,
  options: CaptureOptions = {}
): Promise<PageCapture> {
  const context = await browser.newContext(buildContextOptions(width, height, options));
  const page = await context.newPage();

  try {
    await loadPage(page, url);
    await hideElements(page, options.hideSelectors ?? []);

    if (page.isClosed()) {
      throw new Error("Page closed before capture");
    }

    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    const layout = await samplePageLayout(page);
    const adjusted = await applySiteCrops(Buffer.from(screenshot), options);

    return { screenshot: adjusted, layout };
  } finally {
    await context.close().catch(() => {});
  }
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function closeBrowser(browser: Browser | null): Promise<void> {
  if (browser?.isConnected()) {
    await browser.close().catch(() => {});
  }
}

/** Resize to viewport width only — never crops height */
export async function resizePreviewToWidth(buffer: Buffer, width: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || meta.width === width) return buffer;
  return sharp(buffer).resize({ width }).png().toBuffer();
}
