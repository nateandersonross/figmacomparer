import type { Browser, BrowserContext, BrowserContextOptions, Cookie } from "playwright";
import type { CaptureOptions } from "@/lib/capture/options";

export type WordPressAuth = {
  username: string;
  password: string;
  /** Defaults to {site}/wp-login.php */
  loginUrl?: string;
};

export type HttpBasicAuth = {
  username: string;
  password: string;
};

export type SiteAuthConfig = {
  wordpress?: WordPressAuth;
  httpBasic?: HttpBasicAuth;
  /** JSON cookie export from DevTools, or `name=value; name2=value2` */
  cookies?: string;
};

function siteOrigin(url: string): string {
  const u = new URL(url);
  return u.origin;
}

function defaultLoginUrl(siteUrl: string): string {
  return `${siteOrigin(siteUrl)}/wp-login.php`;
}

/** Parse cookies from JSON (Chrome export) or semicolon-separated pairs. */
export function parseCookieInput(raw: string, siteUrl: string): Cookie[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const origin = siteOrigin(siteUrl);
  const hostname = new URL(origin).hostname;

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as Array<Record<string, unknown>>;
    const defaultExpires = Math.floor(Date.now() / 1000) + 86400 * 30;
    return parsed.map((c) => {
      const exp = c.expirationDate ?? c.expires;
      const expires =
        typeof exp === "number" ? Math.floor(exp) : defaultExpires;
      return {
      name: String(c.name ?? ""),
      value: String(c.value ?? ""),
      domain: typeof c.domain === "string" ? c.domain : hostname,
      path: typeof c.path === "string" ? c.path : "/",
      expires,
      secure: Boolean(c.secure ?? origin.startsWith("https")),
      httpOnly: Boolean(c.httpOnly ?? false),
      sameSite: (c.sameSite === "Strict" || c.sameSite === "None" ? c.sameSite : "Lax") as
        | "Strict"
        | "Lax"
        | "None",
    };
    }).filter((c) => c.name.length > 0);
  }

  const expires = Math.floor(Date.now() / 1000) + 86400 * 30;
  return trimmed.split(";").flatMap((part) => {
    const eq = part.indexOf("=");
    if (eq < 1) return [];
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) return [];
    return [
      {
        name,
        value,
        domain: hostname,
        path: "/",
        expires,
        secure: origin.startsWith("https"),
        httpOnly: false,
        sameSite: "Lax" as const,
      },
    ];
  });
}

/** Log into WordPress and return session cookies for the target site. */
export async function loginWordPress(
  browser: Browser,
  siteUrl: string,
  auth: WordPressAuth
): Promise<Cookie[]> {
  const loginUrl = auth.loginUrl?.trim() || defaultLoginUrl(siteUrl);
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const response = await page.goto(loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (!response || response.status() >= 400) {
      throw new Error(`WordPress login page failed — HTTP ${response?.status() ?? "no response"}`);
    }

    const userField = page.locator("#user_login, input[name='log']").first();
    const passField = page.locator("#user_pass, input[name='pwd']").first();
    const submit = page.locator("#wp-submit, input[type='submit']").first();

    await userField.waitFor({ state: "visible", timeout: 15_000 });
    await userField.fill(auth.username);
    await passField.fill(auth.password);
    await submit.click();

    await page.waitForURL(
      (url) => !url.pathname.includes("wp-login"),
      { timeout: 30_000 }
    ).catch(async () => {
      const err = await page.locator("#login_error").textContent().catch(() => null);
      if (err?.trim()) throw new Error(`WordPress login failed: ${err.trim()}`);
      throw new Error("WordPress login failed — still on login page");
    });

    await page.waitForTimeout(500);
    return await context.cookies();
  } finally {
    await context.close().catch(() => {});
  }
}

/** Obtain cookies once per capture run (WP login and/or pasted cookies). */
export async function obtainAuthCookies(
  browser: Browser,
  siteUrl: string,
  auth: SiteAuthConfig
): Promise<Cookie[]> {
  const merged = new Map<string, Cookie>();

  if (auth.cookies?.trim()) {
    for (const c of parseCookieInput(auth.cookies, siteUrl)) {
      merged.set(`${c.name}@${c.domain}`, c);
    }
  }

  if (auth.wordpress?.username && auth.wordpress.password) {
    const wpCookies = await loginWordPress(browser, siteUrl, auth.wordpress);
    for (const c of wpCookies) {
      merged.set(`${c.name}@${c.domain}`, c);
    }
  }

  return [...merged.values()];
}

export function authToContextOptions(
  auth?: SiteAuthConfig
): Pick<BrowserContextOptions, "httpCredentials"> {
  if (!auth?.httpBasic) return {};
  return {
    httpCredentials: {
      username: auth.httpBasic.username,
      password: auth.httpBasic.password,
    },
  };
}

export async function applyAuthToContext(
  context: BrowserContext,
  siteUrl: string,
  options: CaptureOptions
): Promise<void> {
  if (options.authCookies?.length) {
    await context.addCookies(options.authCookies);
  }
}
