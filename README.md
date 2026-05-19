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
