# FigmaComparer

Audit responsive parity between Figma (mobile + desktop frames) and a live website.

## What it checks

| Category | Examples |
|----------|----------|
| **Typography** | Font size, weight — matched by text content |
| **Section spacing** | Gap between sections, section heights — matched by order |
| **Image sizes** | Width/height of images — matched by order |

Pixel diff is **not** used — too noisy for real-world sites.

## Breakpoint rules

| Viewport | Figma reference |
|----------|-----------------|
| Mobile frame width (e.g. 390px) | **Mobile** frame |
| 768px, 1024px, 1280px, desktop width | **Desktop** frame |

## Setup

```bash
npm install
npm run setup:browsers
npm run dev
```

## Site adjustments

Hide nav/chrome not in Figma via **Hide on site** selectors, or **Crop top** for fixed headers.

## English locale

Defaults to `en-US` + US geolocation. Use your English URL path (e.g. `/en-us/`).

## WordPress drafts & protected dev pages

1. In the WP editor, open your draft page and click **Preview** → copy the preview URL.
2. Paste that full URL into **Website URL** (it should include `?preview=true` or a preview nonce).
3. Under **Draft / protected page access**, choose authentication:
   - **WordPress login** — Playwright signs in via `wp-login.php` before capture (use an editor/admin account).
   - **HTTP Basic** — for staging sites behind basic auth.
   - **Browser cookies** — log in manually in Chrome, copy cookies from DevTools → Application, paste JSON or `name=value` pairs.
4. Capture as usual.

Preview links with a valid nonce sometimes work with **None** auth; drafts that redirect to login need WordPress login or cookies.

## Persisting flagged issues (MySQL)

Set the `MYSQL_*` variables in `.env` to enable per-URL issue history:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=figmacomparer
MYSQL_PASSWORD=secret
MYSQL_DATABASE=figmacomparer
```

- The `flagged_issues` table is created automatically on first use.
- Each flag is keyed by the **normalized website URL** (host + path + query).
- When you capture the same dev URL again, previously saved issues are loaded automatically.
- Flag → POST `/api/issues`; Remove → DELETE `/api/issues/:id`.
- If the MySQL vars are blank, the app still works — issues just live in the current session only.
