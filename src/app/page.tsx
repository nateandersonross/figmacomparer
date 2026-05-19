"use client";

import { useEffect, useRef, useState } from "react";
import { InspectWorkbench } from "@/components/InspectWorkbench";
import { formatApiError, loadFormPrefs, saveFormPrefs } from "@/lib/form-storage";
import type { InspectionSession } from "@/lib/types/inspect";
import styles from "./page.module.css";

function AdjustmentsFields({
  title,
  hideSelectors,
  setHideSelectors,
  siteCropTop,
  setSiteCropTop,
}: {
  title: string;
  hideSelectors: string;
  setHideSelectors: (v: string) => void;
  siteCropTop: string;
  setSiteCropTop: (v: string) => void;
}) {
  return (
    <div className={styles.adjustBlock}>
      <h3>{title}</h3>
      <label>
        Hide on site (CSS selectors)
        <textarea
          rows={2}
          value={hideSelectors}
          onChange={(e) => setHideSelectors(e.target.value)}
          placeholder="header, nav"
        />
      </label>
      <label>
        Crop top (px)
        <input
          type="number"
          min={0}
          value={siteCropTop}
          onChange={(e) => setSiteCropTop(e.target.value)}
          placeholder="optional"
        />
      </label>
    </div>
  );
}

export default function HomePage() {
  const prefsLoaded = useRef(false);

  const [figmaToken, setFigmaToken] = useState("");
  const [figmaFileUrl, setFigmaFileUrl] = useState("");
  const [mobileFrameId, setMobileFrameId] = useState("");
  const [desktopFrameId, setDesktopFrameId] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [mobileHideSelectors, setMobileHideSelectors] = useState("");
  const [mobileCropTop, setMobileCropTop] = useState("");
  const [desktopHideSelectors, setDesktopHideSelectors] = useState("");
  const [desktopCropTop, setDesktopCropTop] = useState("");
  const [rememberSettings, setRememberSettings] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<InspectionSession | null>(null);

  useEffect(() => {
    const saved = loadFormPrefs();
    if (saved.figmaToken) setFigmaToken(saved.figmaToken);
    if (saved.figmaFileUrl) setFigmaFileUrl(saved.figmaFileUrl);
    if (saved.mobileFrameId) setMobileFrameId(saved.mobileFrameId);
    if (saved.desktopFrameId) setDesktopFrameId(saved.desktopFrameId);
    if (saved.websiteUrl) setWebsiteUrl(saved.websiteUrl);
    if (saved.mobileHideSelectors) setMobileHideSelectors(saved.mobileHideSelectors);
    if (saved.mobileCropTop) setMobileCropTop(saved.mobileCropTop);
    if (saved.desktopHideSelectors) setDesktopHideSelectors(saved.desktopHideSelectors);
    if (saved.desktopCropTop) setDesktopCropTop(saved.desktopCropTop);
    prefsLoaded.current = true;
  }, []);

  useEffect(() => {
    if (!prefsLoaded.current || !rememberSettings) return;
    saveFormPrefs({
      figmaToken,
      figmaFileUrl,
      mobileFrameId,
      desktopFrameId,
      websiteUrl,
      mobileHideSelectors,
      mobileCropTop,
      desktopHideSelectors,
      desktopCropTop,
    });
  }, [
    rememberSettings,
    figmaToken,
    figmaFileUrl,
    mobileFrameId,
    desktopFrameId,
    websiteUrl,
    mobileHideSelectors,
    mobileCropTop,
    desktopHideSelectors,
    desktopCropTop,
  ]);

  function buildAdjustments(hide: string, crop: string) {
    const trimmed = hide.trim();
    const siteCropTop = crop ? parseInt(crop, 10) : undefined;
    if (!trimmed && siteCropTop == null) return undefined;
    return { hideSelectors: trimmed || undefined, siteCropTop };
  }

  async function handleCapture(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSession(null);

    try {
      const res = await fetch("/api/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          figmaToken,
          figmaFileUrl,
          mobileFrameId: normalizeNodeId(mobileFrameId),
          desktopFrameId: normalizeNodeId(desktopFrameId),
          websiteUrl,
          locale: "en-US",
          acceptLanguage: "en-US,en;q=0.9",
          timezoneId: "America/New_York",
          mobileAdjustments: buildAdjustments(mobileHideSelectors, mobileCropTop),
          desktopAdjustments: buildAdjustments(desktopHideSelectors, desktopCropTop),
        }),
      });

      let data: { error?: unknown } & InspectionSession = {} as InspectionSession;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server error (${res.status})`);
      }

      if (!res.ok) throw new Error(formatApiError(data.error));

      setSession({ ...data, issues: data.issues ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Design parity</p>
          <h1>FigmaComparer</h1>
          <p className={styles.subtitle}>
            Capture the site, click elements to inspect real CSS metrics, flag issues, and
            export a shareable JSON report.
          </p>
        </div>
      </header>

      <form className={styles.form} onSubmit={handleCapture}>
          <section className={styles.formSectionFigma}>
            <h2>Figma</h2>
            <label>
              Access token
              <input
                type="password"
                value={figmaToken}
                onChange={(e) => setFigmaToken(e.target.value)}
                required
                autoComplete="off"
              />
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={rememberSettings}
                onChange={(e) => setRememberSettings(e.target.checked)}
              />
              Remember settings in this browser
            </label>
            <label>
              File URL
              <input
                type="url"
                value={figmaFileUrl}
                onChange={(e) => setFigmaFileUrl(e.target.value)}
                required
              />
            </label>
            <div className={styles.row}>
              <label>
                Mobile frame ID
                <input
                  value={mobileFrameId}
                  onChange={(e) => setMobileFrameId(e.target.value)}
                  required
                />
              </label>
              <label>
                Desktop frame ID
                <input
                  value={desktopFrameId}
                  onChange={(e) => setDesktopFrameId(e.target.value)}
                  required
                />
              </label>
            </div>
          </section>

          <section className={styles.formSectionWeb}>
            <h2>Website</h2>
            <label>
              URL
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                required
              />
            </label>
          </section>

          <section className={styles.formAdvanced}>
            <button
              type="button"
              className={styles.advancedToggle}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide" : "Show"} site adjustments
            </button>
            {showAdvanced && (
              <div className={styles.advanced}>
                <AdjustmentsFields
                  title="Mobile capture"
                  hideSelectors={mobileHideSelectors}
                  setHideSelectors={setMobileHideSelectors}
                  siteCropTop={mobileCropTop}
                  setSiteCropTop={setMobileCropTop}
                />
                <AdjustmentsFields
                  title="Desktop & responsive"
                  hideSelectors={desktopHideSelectors}
                  setHideSelectors={setDesktopHideSelectors}
                  siteCropTop={desktopCropTop}
                  setSiteCropTop={setDesktopCropTop}
                />
              </div>
            )}
          </section>

          <div className={styles.formActions}>
            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? "Capturing…" : "Capture for inspection"}
            </button>
            {error && <p className={styles.error}>{error}</p>}
          </div>
      </form>

      {session && (
        <main className={styles.workbench}>
          <InspectWorkbench session={session} onUpdate={setSession} />
        </main>
      )}
    </div>
  );
}

function normalizeNodeId(id: string): string {
  return id.trim().replace(/-/g, ":");
}
