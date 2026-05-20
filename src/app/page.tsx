"use client";

import { useEffect, useRef, useState } from "react";
import { InspectWorkbench } from "@/components/InspectWorkbench";
import type { SiteAuthConfig } from "@/lib/capture/auth";
import { formatApiError, loadFormPrefs, saveFormPrefs } from "@/lib/form-storage";
import type { InspectionSession } from "@/lib/types/inspect";
import styles from "./page.module.css";

type SiteAuthMode = "none" | "wordpress" | "basic" | "cookies";

function SiteAuthFields({
  authMode,
  setAuthMode,
  wpUsername,
  setWpUsername,
  wpPassword,
  setWpPassword,
  wpLoginUrl,
  setWpLoginUrl,
  basicUsername,
  setBasicUsername,
  basicPassword,
  setBasicPassword,
  authCookies,
  setAuthCookies,
}: {
  authMode: SiteAuthMode;
  setAuthMode: (v: SiteAuthMode) => void;
  wpUsername: string;
  setWpUsername: (v: string) => void;
  wpPassword: string;
  setWpPassword: (v: string) => void;
  wpLoginUrl: string;
  setWpLoginUrl: (v: string) => void;
  basicUsername: string;
  setBasicUsername: (v: string) => void;
  basicPassword: string;
  setBasicPassword: (v: string) => void;
  authCookies: string;
  setAuthCookies: (v: string) => void;
}) {
  return (
    <div className={styles.authBlock}>
      <h3>Draft / protected page access</h3>
      <p className={styles.urlHint}>
        For WordPress <strong>drafts</strong>, paste the preview URL from the editor
        (Preview → copy link). It usually includes <code>?preview=true</code>. Then
        choose how Playwright should authenticate.
      </p>
      <label>
        Authentication
        <select
          value={authMode}
          onChange={(e) => setAuthMode(e.target.value as SiteAuthMode)}
        >
          <option value="none">None (public or preview link only)</option>
          <option value="wordpress">WordPress login</option>
          <option value="basic">HTTP Basic (staging gate)</option>
          <option value="cookies">Browser cookies (paste)</option>
        </select>
      </label>

      {authMode === "wordpress" && (
        <>
          <label>
            WP username or email
            <input
              type="text"
              value={wpUsername}
              onChange={(e) => setWpUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            WP password
            <input
              type="password"
              value={wpPassword}
              onChange={(e) => setWpPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            Login URL (optional)
            <input
              type="url"
              value={wpLoginUrl}
              onChange={(e) => setWpLoginUrl(e.target.value)}
              placeholder="https://yoursite.com/wp-login.php"
            />
          </label>
        </>
      )}

      {authMode === "basic" && (
        <>
          <label>
            Basic auth username
            <input
              value={basicUsername}
              onChange={(e) => setBasicUsername(e.target.value)}
            />
          </label>
          <label>
            Basic auth password
            <input
              type="password"
              value={basicPassword}
              onChange={(e) => setBasicPassword(e.target.value)}
            />
          </label>
        </>
      )}

      {authMode === "cookies" && (
        <label>
          Cookies
          <textarea
            rows={4}
            value={authCookies}
            onChange={(e) => setAuthCookies(e.target.value)}
            placeholder='JSON from DevTools, or: wordpress_logged_in_xxx=...; wordpress_sec_xxx=...'
            className={styles.cookieInput}
          />
        </label>
      )}
    </div>
  );
}

function buildSiteAuth(
  authMode: SiteAuthMode,
  wpUsername: string,
  wpPassword: string,
  wpLoginUrl: string,
  basicUsername: string,
  basicPassword: string,
  authCookies: string
): SiteAuthConfig | undefined {
  if (authMode === "none") return undefined;

  const auth: SiteAuthConfig = {};

  if (authMode === "wordpress" && wpUsername.trim() && wpPassword) {
    auth.wordpress = {
      username: wpUsername.trim(),
      password: wpPassword,
      loginUrl: wpLoginUrl.trim() || undefined,
    };
  }

  if (authMode === "basic" && basicUsername.trim() && basicPassword) {
    auth.httpBasic = {
      username: basicUsername.trim(),
      password: basicPassword,
    };
  }

  if (authMode === "cookies" && authCookies.trim()) {
    auth.cookies = authCookies.trim();
  }

  if (!auth.wordpress && !auth.httpBasic && !auth.cookies) return undefined;
  return auth;
}

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
  const [siteAuthMode, setSiteAuthMode] = useState<SiteAuthMode>("none");
  const [wpUsername, setWpUsername] = useState("");
  const [wpPassword, setWpPassword] = useState("");
  const [wpLoginUrl, setWpLoginUrl] = useState("");
  const [basicUsername, setBasicUsername] = useState("");
  const [basicPassword, setBasicPassword] = useState("");
  const [authCookies, setAuthCookies] = useState("");
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
    if (saved.siteAuthMode) setSiteAuthMode(saved.siteAuthMode as SiteAuthMode);
    if (saved.wpUsername) setWpUsername(saved.wpUsername);
    if (saved.wpPassword) setWpPassword(saved.wpPassword);
    if (saved.wpLoginUrl) setWpLoginUrl(saved.wpLoginUrl);
    if (saved.basicUsername) setBasicUsername(saved.basicUsername);
    if (saved.basicPassword) setBasicPassword(saved.basicPassword);
    if (saved.authCookies) setAuthCookies(saved.authCookies);
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
      siteAuthMode,
      wpUsername,
      wpPassword: rememberSettings ? wpPassword : undefined,
      wpLoginUrl,
      basicUsername,
      basicPassword: rememberSettings ? basicPassword : undefined,
      authCookies,
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
    siteAuthMode,
    wpUsername,
    wpPassword,
    wpLoginUrl,
    basicUsername,
    basicPassword,
    authCookies,
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
          siteAuth: buildSiteAuth(
            siteAuthMode,
            wpUsername,
            wpPassword,
            wpLoginUrl,
            basicUsername,
            basicPassword,
            authCookies
          ),
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
            <SiteAuthFields
              authMode={siteAuthMode}
              setAuthMode={setSiteAuthMode}
              wpUsername={wpUsername}
              setWpUsername={setWpUsername}
              wpPassword={wpPassword}
              setWpPassword={setWpPassword}
              wpLoginUrl={wpLoginUrl}
              setWpLoginUrl={setWpLoginUrl}
              basicUsername={basicUsername}
              setBasicUsername={setBasicUsername}
              basicPassword={basicPassword}
              setBasicPassword={setBasicPassword}
              authCookies={authCookies}
              setAuthCookies={setAuthCookies}
            />
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
