export type BoxSides = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

export type InspectMetrics = {
  width: number;
  height: number;
  margin: BoxSides;
  padding: BoxSides;
  gap?: string;
  fontSize?: string;
  fontWeight?: string;
  fontFamily?: string;
  lineHeight?: string;
  letterSpacing?: string;
  color?: string;
  /** px gap to next visible sibling below */
  gapAfter: number | null;
};

export type InspectableElement = {
  id: string;
  kind: "section" | "image" | "text" | "element";
  label: string;
  tag: string;
  rect: { top: number; left: number; width: number; height: number };
  metrics: InspectMetrics;
};

export type InspectBreakpoint = {
  width: number;
  label: string;
  figmaSource: "mobile" | "desktop";
  figmaPath: string;
  sitePath: string;
  viewportWidth: number;
  viewportHeight: number;
  figmaViewportWidth: number;
  figmaViewportHeight: number;
  elements: InspectableElement[];
  figmaElements: InspectableElement[];
  isDefaultMobile?: boolean;
  isDefaultDesktop?: boolean;
};

export type IssueCategory = "spacing" | "typography" | "image" | "layout" | "other";

export type FlaggedIssue = {
  id: string;
  createdAt: string;
  breakpointWidth: number;
  breakpointLabel: string;
  elementId: string;
  elementLabel: string;
  elementKind: InspectableElement["kind"];
  category: IssueCategory;
  property: string;
  expected: string;
  actual: string;
  notes: string;
  anchor: { x: number; y: number; width: number; height: number };
  resolved?: boolean;
  resolvedAt?: string | null;
};

export type InspectionSession = {
  id: string;
  createdAt: string;
  websiteUrl: string;
  figmaFileKey?: string;
  mobileFrameId?: string;
  desktopFrameId?: string;
  breakpoints: InspectBreakpoint[];
  issues: FlaggedIssue[];
};
