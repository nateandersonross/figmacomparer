import type { CaptureOptions } from "@/lib/capture/options";
import { parseHideSelectors } from "@/lib/capture/options";
import type { SiteAdjustments } from "@/lib/types";

export function adjustmentsToCaptureOptions(
  adjustments?: SiteAdjustments,
  base?: Pick<CaptureOptions, "locale" | "acceptLanguage" | "timezoneId">
): CaptureOptions {
  return {
    ...base,
    hideSelectors: adjustments?.hideSelectors ?? [],
    siteCropTop: adjustments?.siteCropTop,
    siteCropBottom: adjustments?.siteCropBottom,
  };
}

export function parseAdjustmentsInput(input?: {
  hideSelectors?: string | string[];
  siteCropTop?: number;
  siteCropBottom?: number;
}): SiteAdjustments | undefined {
  if (!input) return undefined;
  const hideSelectors = parseHideSelectors(input.hideSelectors);
  const hasCrop = input.siteCropTop != null || input.siteCropBottom != null;
  if (!hideSelectors.length && !hasCrop) return undefined;
  return {
    hideSelectors: hideSelectors.length ? hideSelectors : undefined,
    siteCropTop: input.siteCropTop,
    siteCropBottom: input.siteCropBottom,
  };
}
