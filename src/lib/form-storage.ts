const STORAGE_KEY = "figmacomparer.prefs";

export type SavedFormPrefs = {
  figmaToken?: string;
  figmaFileUrl?: string;
  mobileFrameId?: string;
  desktopFrameId?: string;
  websiteUrl?: string;
  mobileHideSelectors?: string;
  mobileCropTop?: string;
  desktopHideSelectors?: string;
  desktopCropTop?: string;
  /** none | wordpress | basic | cookies */
  siteAuthMode?: string;
  wpUsername?: string;
  wpPassword?: string;
  wpLoginUrl?: string;
  basicUsername?: string;
  basicPassword?: string;
  authCookies?: string;
};

export function loadFormPrefs(): SavedFormPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SavedFormPrefs;
  } catch {
    return {};
  }
}

export function saveFormPrefs(prefs: SavedFormPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // quota or private browsing — ignore
  }
}

export function formatApiError(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "Comparison failed";

  const e = error as {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };

  const parts: string[] = [];

  if (Array.isArray(e.formErrors)) {
    parts.push(...e.formErrors);
  }

  if (e.fieldErrors && typeof e.fieldErrors === "object") {
    for (const [field, messages] of Object.entries(e.fieldErrors)) {
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          parts.push(`${field}: ${msg}`);
        }
      }
    }
  }

  return parts.length > 0 ? parts.join("; ") : "Comparison failed";
}
