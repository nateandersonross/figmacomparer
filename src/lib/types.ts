export type DiscrepancyAnchor = {
  /** Position as % of captured screenshot */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Discrepancy = {
  id: string;
  category: "typography" | "spacing" | "image";
  name: string;
  property: string;
  figma: string;
  site: string;
  delta?: string;
  severity: "error" | "warning";
  anchor?: DiscrepancyAnchor;
  /** Matching region on the Figma export */
  figmaAnchor?: DiscrepancyAnchor;
};

export type DesignAudit = {
  discrepancies: Discrepancy[];
  byCategory: {
    typography: Discrepancy[];
    spacing: Discrepancy[];
    image: Discrepancy[];
  };
  counts: {
    typography: number;
    spacing: number;
    image: number;
    total: number;
  };
};

export type SiteAdjustments = {
  hideSelectors?: string[];
  siteCropTop?: number;
  siteCropBottom?: number;
};

export type BreakpointResult = {
  width: number;
  label: string;
  figmaSource: "mobile" | "desktop";
  figmaPath: string;
  sitePath: string;
  captureHeight: number;
  audit: DesignAudit;
};

export type ComparisonConfig = {
  figmaToken: string;
  figmaFileKey: string;
  mobileFrameId: string;
  desktopFrameId: string;
  websiteUrl: string;
  intermediateWidths?: number[];
  locale?: string;
  acceptLanguage?: string;
  timezoneId?: string;
  mobileAdjustments?: SiteAdjustments;
  desktopAdjustments?: SiteAdjustments;
};

export type ComparisonReport = {
  id: string;
  createdAt: string;
  config: Omit<ComparisonConfig, "figmaToken">;
  mobileWidth: number;
  desktopWidth: number;
  breakpoints: BreakpointResult[];
  summary: {
    totalDiscrepancies: number;
    typography: number;
    spacing: number;
    image: number;
  };
};
