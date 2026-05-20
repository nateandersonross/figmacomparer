import type { Cookie } from "playwright";
import type { SiteAuthConfig } from "@/lib/capture/auth";

export type CaptureOptions = {
  /** BCP 47 locale, e.g. en-US */
  locale?: string;
  /** Accept-Language header value */
  acceptLanguage?: string;
  timezoneId?: string;
  /** CSS selectors to hide on the site before capture (e.g. nav, cookie banners) */
  hideSelectors?: string[];
  /** Pixels to crop from the top of the site screenshot (e.g. fixed header height) */
  siteCropTop?: number;
  /** Pixels to crop from the bottom of the site screenshot */
  siteCropBottom?: number;
  /**
   * Pixels from the top of the site image to exclude from diff scoring only.
   * Use when the nav is visible but shouldn't affect match %.
   */
  ignoreDiffTopPx?: number;
  /** Session cookies from WordPress login or pasted browser cookies */
  authCookies?: Cookie[];
  /** HTTP Basic Auth for staging gates */
  siteAuth?: SiteAuthConfig;
};

export const DEFAULT_CAPTURE_OPTIONS: Required<
  Pick<CaptureOptions, "locale" | "acceptLanguage" | "timezoneId">
> = {
  locale: "en-US",
  acceptLanguage: "en-US,en;q=0.9",
  timezoneId: "America/New_York",
};

export function parseHideSelectors(input?: string | string[]): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((s) => s.trim()).filter(Boolean);
  return input
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
