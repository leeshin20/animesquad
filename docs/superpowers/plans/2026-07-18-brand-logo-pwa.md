# AnimeSquad Brand Logo and PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved ribbon-shaped `A` logo, green brand color roles, navbar lockup, and installable PWA icon set without redesigning the existing neutral UI.

**Architecture:** Keep one deterministic geometric definition for the brand mark and generate the committed SVG, PNG, and ICO assets from it. Expose the mark through a small presentational React component, use Next.js App Router metadata files for PWA integration, and add named Tailwind brand tokens for a deliberately limited set of brand surfaces.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS 3, Node test runner, Python 3 with Pillow 12.2 for deterministic asset generation

## Global Constraints

- Preserve the existing white and neutral-gray UI; do not recolor every neutral control.
- Use `#22C55E` for Brand Bright, `#15803D` for Brand Strong, `#DCFCE7` for Brand Soft, and `#4ADE80` for Brand Light.
- Use `#15803D` rather than `#22C55E` behind white button text.
- Keep the navbar wordmark as live Geist SemiBold text with the exact copy `AnimeSquad`.
- Render the navbar mark at 28px with a 9px gap before the wordmark.
- Keep danger, warning, and error states on their existing rose/amber colors.
- Do not add dark mode, an animated logo, or a separate marketing wordmark.
- Generate the logo deterministically from vector geometry; do not use an image-generation model for the final asset.
- Run test, generator, lint, build, and dev commands with working directory `frontend`; run `git` commands with working directory at the repository root.

---

## File Structure

- `frontend/scripts/generate_brand_assets.py` — single source of geometry and generator for all committed brand images.
- `frontend/scripts/requirements-brand-assets.txt` — pins the generator-only Pillow version.
- `frontend/public/brand/logo-mark.svg` — transparent full-color vector used in the UI.
- `frontend/public/brand/logo-mark-monochrome.svg` — transparent single-color fallback vector.
- `frontend/public/brand/pwa-192.png` and `pwa-512.png` — regular install icons.
- `frontend/public/brand/pwa-maskable-192.png` and `pwa-maskable-512.png` — safe-zone-aware adaptive icons.
- `frontend/public/brand/apple-touch-icon.png` — 180px iOS home-screen icon.
- `frontend/src/app/favicon.ico` — 16px and 32px browser-tab icon, replacing the existing placeholder.
- `frontend/src/app/brand-assets.test.mjs` — verifies palette, file set, raster dimensions, and ICO frames.
- `frontend/src/app/components/BrandLockup.tsx` — reusable mark and live-text lockup.
- `frontend/src/app/components/BrandLockup.test.tsx` — server-rendered accessibility and layout contract.
- `frontend/src/app/components/NavBar.tsx` — consumes `BrandLockup` on desktop and mobile.
- `frontend/src/app/manifest.ts` — install metadata and standard/maskable icon declarations.
- `frontend/src/app/manifest.test.ts` — exact PWA metadata contract.
- `frontend/src/app/layout.tsx` — favicon, Apple icon, manifest, and theme-color metadata.
- `frontend/tailwind.config.ts` — named brand color roles.
- `frontend/src/app/page.tsx` — brand-colored landing CTA.
- `frontend/src/app/brand-ui.test.mjs` — guards the intentionally limited point-color usage.

---

### Task 1: Deterministic Brand Asset Set

**Files:**
- Create: `frontend/src/app/brand-assets.test.mjs`
- Create: `frontend/scripts/generate_brand_assets.py`
- Create: `frontend/scripts/requirements-brand-assets.txt`
- Create: `frontend/public/brand/logo-mark.svg`
- Create: `frontend/public/brand/logo-mark-monochrome.svg`
- Create: `frontend/public/brand/pwa-192.png`
- Create: `frontend/public/brand/pwa-512.png`
- Create: `frontend/public/brand/pwa-maskable-192.png`
- Create: `frontend/public/brand/pwa-maskable-512.png`
- Create: `frontend/public/brand/apple-touch-icon.png`
- Replace: `frontend/src/app/favicon.ico`

**Interfaces:**
- Consumes: Approved 96×96 ribbon-A geometry and the four exact color values from the design spec.
- Produces: `/brand/logo-mark.svg`, `/brand/logo-mark-monochrome.svg`, five raster files under `/brand/`, and `/favicon.ico` for later UI and metadata tasks.

- [ ] **Step 1: Write the failing asset contract test**

Create `frontend/src/app/brand-assets.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const frontendRoot = new URL("../../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, frontendRoot));
}

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test("brand SVG uses the approved flat palette and viewBox", async () => {
  const svg = (await read("public/brand/logo-mark.svg")).toString("utf8");

  assert.match(svg, /viewBox="0 0 96 96"/);
  assert.match(svg, /#22C55E/);
  assert.match(svg, /#15803D/);
  assert.match(svg, /#4ADE80/);
  assert.doesNotMatch(svg, /linearGradient|filter|shadow/);
});

for (const [path, size] of [
  ["public/brand/pwa-192.png", 192],
  ["public/brand/pwa-512.png", 512],
  ["public/brand/pwa-maskable-192.png", 192],
  ["public/brand/pwa-maskable-512.png", 512],
  ["public/brand/apple-touch-icon.png", 180],
]) {
  test(`${path} is a ${size}px square PNG`, async () => {
    assert.deepEqual(pngDimensions(await read(path)), {
      width: size,
      height: size,
    });
  });
}

test("favicon contains 16px and 32px frames", async () => {
  const ico = await read("src/app/favicon.ico");

  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 2);
  assert.deepEqual([ico[6], ico[22]], [16, 32]);
});
```

- [ ] **Step 2: Run the asset test and verify it fails**

Run:

```bash
node --test src/app/brand-assets.test.mjs
```

Expected: FAIL with `ENOENT` for `public/brand/logo-mark.svg`.

- [ ] **Step 3: Add the pinned generator dependency**

Create `frontend/scripts/requirements-brand-assets.txt`:

```text
Pillow==12.2.0
```

- [ ] **Step 4: Add the complete deterministic generator**

Create `frontend/scripts/generate_brand_assets.py`:

```python
from pathlib import Path

from PIL import Image, ImageDraw


FRONTEND = Path(__file__).resolve().parents[1]
BRAND_DIR = FRONTEND / "public" / "brand"
APP_DIR = FRONTEND / "src" / "app"

BRIGHT = "#22C55E"
STRONG = "#15803D"
SOFT = "#DCFCE7"
LIGHT = "#4ADE80"
WHITE = "#FFFFFF"

OUTER = [(48, 10), (86, 78), (67, 85), (48, 49), (29, 85), (10, 78)]
CROSSBAR = [(32, 62), (64, 62), (72, 76), (24, 76)]
END_FACE = [(67, 85), (86, 78), (76, 60)]


def svg_path(points: list[tuple[int, int]]) -> str:
    head, *tail = points
    return "M" + " ".join(map(str, head)) + " " + " ".join(
        "L" + " ".join(map(str, point)) for point in tail
    ) + "Z"


def write_svg(path: Path, colors: tuple[str, str, str]) -> None:
    outer, crossbar, end_face = colors
    path.write_text(
        "\n".join(
            [
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">',
                f'  <path d="{svg_path(OUTER)}" fill="{outer}"/>',
                f'  <path d="{svg_path(CROSSBAR)}" fill="{crossbar}"/>',
                f'  <path d="{svg_path(END_FACE)}" fill="{end_face}"/>',
                "</svg>",
                "",
            ]
        ),
        encoding="utf-8",
    )


def transformed(
    points: list[tuple[int, int]], size: int, scale: float
) -> list[tuple[float, float]]:
    factor = size / 96
    return [
        (
            (48 + (x - 48) * scale) * factor,
            (48 + (y - 48) * scale) * factor,
        )
        for x, y in points
    ]


def app_icon(size: int, scale: float) -> Image.Image:
    supersampled = size * 4
    image = Image.new("RGBA", (supersampled, supersampled), BRIGHT)
    draw = ImageDraw.Draw(image)
    draw.polygon(transformed(OUTER, supersampled, scale), fill=WHITE)
    draw.polygon(transformed(CROSSBAR, supersampled, scale), fill=SOFT)
    draw.polygon(transformed(END_FACE, supersampled, scale), fill="#BBF7D0")
    return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    write_svg(BRAND_DIR / "logo-mark.svg", (BRIGHT, STRONG, LIGHT))
    write_svg(BRAND_DIR / "logo-mark-monochrome.svg", ("#000000", "#000000", "#000000"))

    app_icon(192, 0.78).save(BRAND_DIR / "pwa-192.png")
    app_icon(512, 0.78).save(BRAND_DIR / "pwa-512.png")
    app_icon(192, 0.62).save(BRAND_DIR / "pwa-maskable-192.png")
    app_icon(512, 0.62).save(BRAND_DIR / "pwa-maskable-512.png")
    app_icon(180, 0.78).save(BRAND_DIR / "apple-touch-icon.png")

    favicon = app_icon(256, 0.72).convert("RGBA")
    favicon.save(APP_DIR / "favicon.ico", sizes=[(16, 16), (32, 32)])


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Generate the assets**

Run with the bundled Codex Python runtime, which already contains Pillow 12.2:

```bash
/Users/yubeen/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/generate_brand_assets.py
```

Expected: command exits with status 0 and creates every asset listed in this task.

- [ ] **Step 6: Run the asset contract test**

Run:

```bash
node --test src/app/brand-assets.test.mjs
```

Expected: 7 tests PASS.

- [ ] **Step 7: Inspect the generated assets at small and large sizes**

Open `frontend/public/brand/logo-mark.svg`, `frontend/public/brand/pwa-512.png`, and `frontend/public/brand/pwa-maskable-512.png`. Confirm that the A silhouette remains legible, the regular icon has more visual presence than the maskable icon, and the maskable mark stays inside the central safe area.

- [ ] **Step 8: Commit the brand assets**

```bash
git add frontend/scripts/generate_brand_assets.py frontend/scripts/requirements-brand-assets.txt frontend/public/brand frontend/src/app/favicon.ico frontend/src/app/brand-assets.test.mjs
git commit -m "feat(brand): add ribbon A asset set"
```

---

### Task 2: Reusable Navbar Brand Lockup

**Files:**
- Create: `frontend/src/app/components/BrandLockup.tsx`
- Create: `frontend/src/app/components/BrandLockup.test.tsx`
- Modify: `frontend/src/app/components/NavBar.tsx:158-164, 242-245`

**Interfaces:**
- Consumes: `/brand/logo-mark.svg` from Task 1.
- Produces: `BrandMark({ className? }: { className?: string })` and `BrandLockup({ className? }: { className?: string })` for both navbar placements.

- [ ] **Step 1: Write the failing lockup component test**

Create `frontend/src/app/components/BrandLockup.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLockup, BrandMark } from "./BrandLockup";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("brand mark is decorative and uses the approved SVG", () => {
  const html = renderToStaticMarkup(<BrandMark />);

  assert.match(html, /src="\/brand\/logo-mark\.svg"/);
  assert.match(html, /alt=""/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /h-7 w-7/);
});

test("brand lockup keeps live text and the exact 9px gap", () => {
  const html = renderToStaticMarkup(<BrandLockup />);

  assert.match(html, />AnimeSquad</);
  assert.match(html, /gap-\[9px\]/);
  assert.match(html, /font-semibold/);
});
```

- [ ] **Step 2: Run the lockup test and verify it fails**

Run:

```bash
pnpm exec tsx --test src/app/components/BrandLockup.test.tsx
```

Expected: FAIL with `Cannot find module './BrandLockup'`.

- [ ] **Step 3: Implement the presentational lockup**

Create `frontend/src/app/components/BrandLockup.tsx`:

```tsx
export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo-mark.svg"
      alt=""
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    />
  );
}

export function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[9px] text-base font-semibold tracking-tight ${className}`}>
      <BrandMark />
      <span>AnimeSquad</span>
    </span>
  );
}
```

- [ ] **Step 4: Run the lockup test**

Run:

```bash
pnpm exec tsx --test src/app/components/BrandLockup.test.tsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: Replace both navbar text-only placements**

In `frontend/src/app/components/NavBar.tsx`, add:

```tsx
import { BrandLockup } from "@/app/components/BrandLockup";
```

Replace the desktop logo link with:

```tsx
<Link href="/" className="shrink-0" aria-label="AnimeSquad 홈">
  <BrandLockup />
</Link>
```

Replace the mobile drawer text span with:

```tsx
<Link href="/" aria-label="AnimeSquad 홈">
  <BrandLockup />
</Link>
```

- [ ] **Step 6: Run component tests and lint**

Run:

```bash
pnpm exec tsx --test src/app/components/BrandLockup.test.tsx src/app/components/Timeline.test.tsx
pnpm lint
```

Expected: 6 tests PASS and lint exits with no errors.

- [ ] **Step 7: Commit the navbar lockup**

```bash
git add frontend/src/app/components/BrandLockup.tsx frontend/src/app/components/BrandLockup.test.tsx frontend/src/app/components/NavBar.tsx
git commit -m "feat(brand): add navbar logo lockup"
```

---

### Task 3: PWA Manifest and Icon Metadata

**Files:**
- Create: `frontend/src/app/manifest.ts`
- Create: `frontend/src/app/manifest.test.ts`
- Modify: `frontend/src/app/layout.tsx:1-25`

**Interfaces:**
- Consumes: Regular, maskable, Apple, and favicon assets from Task 1.
- Produces: `/manifest.webmanifest`, browser theme color, favicon metadata, and Apple Touch Icon metadata.

- [ ] **Step 1: Write the failing manifest contract test**

Create `frontend/src/app/manifest.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import manifest from "./manifest";

test("manifest exposes the approved AnimeSquad identity", () => {
  const value = manifest();

  assert.equal(value.name, "AnimeSquad");
  assert.equal(value.short_name, "AnimeSquad");
  assert.equal(value.start_url, "/");
  assert.equal(value.display, "standalone");
  assert.equal(value.theme_color, "#22C55E");
  assert.equal(value.background_color, "#FFFFFF");
});

test("manifest declares regular and maskable icons at both PWA sizes", () => {
  const icons = manifest().icons;

  assert.deepEqual(icons, [
    { src: "/brand/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/brand/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/brand/pwa-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/brand/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);
});
```

- [ ] **Step 2: Run the manifest test and verify it fails**

Run:

```bash
pnpm exec tsx --test src/app/manifest.test.ts
```

Expected: FAIL with `Cannot find module './manifest'`.

- [ ] **Step 3: Implement the manifest route**

Create `frontend/src/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AnimeSquad",
    short_name: "AnimeSquad",
    description: "스쿼드와 함께 보는 애니메이션 추적",
    start_url: "/",
    display: "standalone",
    theme_color: "#22C55E",
    background_color: "#FFFFFF",
    icons: [
      { src: "/brand/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/pwa-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 4: Run the manifest test**

Run:

```bash
pnpm exec tsx --test src/app/manifest.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Connect App Router metadata**

Change the first import in `frontend/src/app/layout.tsx` to:

```tsx
import type { Metadata, Viewport } from "next";
```

Extend `metadata` and add `viewport`:

```tsx
export const metadata: Metadata = {
  title: "AnimeSquad",
  description: "스쿼드와 함께 보는 애니메이션 추적",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/brand/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#22C55E",
};
```

- [ ] **Step 6: Run manifest tests, type checking through build, and lint**

Run:

```bash
pnpm exec tsx --test src/app/manifest.test.ts
pnpm lint
pnpm build
```

Expected: 2 tests PASS, lint exits with no errors, and the production build lists `/manifest.webmanifest` without TypeScript errors.

- [ ] **Step 7: Commit PWA metadata**

```bash
git add frontend/src/app/manifest.ts frontend/src/app/manifest.test.ts frontend/src/app/layout.tsx
git commit -m "feat(pwa): add branded install metadata"
```

---

### Task 4: Named Brand Tokens and Limited Point-Color Surfaces

**Files:**
- Create: `frontend/src/app/brand-ui.test.mjs`
- Modify: `frontend/tailwind.config.ts:6-14`
- Modify: `frontend/src/app/components/NavBar.tsx:165-207, 264-272`
- Modify: `frontend/src/app/page.tsx:45-49`
- Modify: `frontend/src/app/onboarding/page.tsx:170-174`
- Modify: `frontend/src/app/invite/page.tsx:60-64`
- Modify: `frontend/src/app/squads/page.tsx:96-118`

**Interfaces:**
- Consumes: Exact approved color roles and the navbar integration from Task 2.
- Produces: Tailwind classes `brand-bright`, `brand-strong`, `brand-soft`, and `brand-light`; branded navbar selection/search focus and entry-flow CTAs.

- [ ] **Step 1: Write the failing limited-scope color test**

Create `frontend/src/app/brand-ui.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("Tailwind exposes the four approved brand roles", async () => {
  const config = await source("../../tailwind.config.ts");

  assert.match(config, /bright:\s*"#22C55E"/);
  assert.match(config, /strong:\s*"#15803D"/);
  assert.match(config, /soft:\s*"#DCFCE7"/);
  assert.match(config, /light:\s*"#4ADE80"/);
});

test("navbar uses soft selection and bright focus without changing neutral defaults", async () => {
  const navbar = await source("./components/NavBar.tsx");

  assert.match(navbar, /bg-brand-soft text-brand-strong/);
  assert.match(navbar, /focus:border-brand-bright/);
  assert.match(navbar, /focus:ring-brand-light/);
  assert.match(navbar, /text-neutral-600 hover:bg-neutral-100/);
});

test("entry-flow CTAs use the accessible strong green", async () => {
  for (const path of ["./page.tsx", "./onboarding/page.tsx", "./invite/page.tsx", "./squads/page.tsx"]) {
    const page = await source(path);
    assert.match(page, /bg-brand-strong/, path);
    assert.match(page, /hover:bg-green-800/, path);
    assert.doesNotMatch(page, /bg-brand-bright[^\n]*text-white/, path);
  }
});
```

- [ ] **Step 2: Run the point-color test and verify it fails**

Run:

```bash
node --test src/app/brand-ui.test.mjs
```

Expected: 3 tests FAIL because the named brand tokens and classes do not exist.

- [ ] **Step 3: Add named Tailwind color roles**

In `frontend/tailwind.config.ts`, extend the theme with:

```ts
colors: {
  brand: {
    bright: "#22C55E",
    strong: "#15803D",
    soft: "#DCFCE7",
    light: "#4ADE80",
  },
},
```

Keep the existing `fontFamily` block unchanged.

- [ ] **Step 4: Apply brand color only to navbar interaction states**

In `frontend/src/app/components/NavBar.tsx`:

- Replace each search input's `focus:border-neutral-900 focus:outline-none` with `focus:border-brand-bright focus:outline-none focus:ring-2 focus:ring-brand-light`.
- Replace desktop active link `bg-neutral-900 text-white` with `bg-brand-soft text-brand-strong`.
- Replace active desktop profile `bg-neutral-900 text-white` with `bg-brand-soft text-brand-strong`.
- Replace active mobile link `bg-neutral-100 text-neutral-900` with `bg-brand-soft text-brand-strong`.
- Keep inactive neutral classes unchanged.

The resulting changed class fragments must be exactly:

```tsx
"w-full rounded-md border border-neutral-300 py-1.5 pl-8 pr-3 text-sm focus:border-brand-bright focus:outline-none focus:ring-2 focus:ring-brand-light"
"w-44 rounded-md border border-neutral-300 py-1.5 pl-8 pr-3 text-sm focus:border-brand-bright focus:outline-none focus:ring-2 focus:ring-brand-light"

active ? "bg-brand-soft text-brand-strong" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
profileActive ? "bg-brand-soft text-brand-strong" : "text-neutral-700 hover:bg-neutral-100"
active ? "bg-brand-soft text-brand-strong" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
```

- [ ] **Step 5: Apply Brand Strong to entry-flow CTAs**

In `frontend/src/app/page.tsx`, change the Google CTA class from:

```tsx
className="mt-8 inline-flex items-center justify-center rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
```

to:

```tsx
className="mt-8 inline-flex items-center justify-center rounded-lg bg-brand-strong px-5 py-2.5 text-sm font-medium text-white transition hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light focus-visible:ring-offset-2"
```

Apply the same color and focus treatment to the existing primary submit buttons in:

```text
frontend/src/app/onboarding/page.tsx
frontend/src/app/invite/page.tsx
frontend/src/app/squads/page.tsx
```

For each existing primary button, replace only `bg-neutral-900` with `bg-brand-strong`, replace only `hover:bg-neutral-700` with `hover:bg-green-800`, and append:

```text
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light focus-visible:ring-offset-2
```

Do not change secondary, destructive, admin, modal, or inline edit controls.

- [ ] **Step 6: Run the color contract and component tests**

Run:

```bash
node --test src/app/brand-ui.test.mjs
pnpm exec tsx --test src/app/components/BrandLockup.test.tsx
pnpm lint
```

Expected: 5 tests PASS and lint exits with no errors.

- [ ] **Step 7: Commit brand tokens and scoped UI usage**

```bash
git add frontend/tailwind.config.ts frontend/src/app/components/NavBar.tsx frontend/src/app/page.tsx frontend/src/app/onboarding/page.tsx frontend/src/app/invite/page.tsx frontend/src/app/squads/page.tsx frontend/src/app/brand-ui.test.mjs
git commit -m "feat(ui): apply AnimeSquad brand colors"
```

---

### Task 5: Full Verification and Visual QA

**Files:**
- Verify only; modify earlier task files only when a check exposes a requirement mismatch.

**Interfaces:**
- Consumes: All artifacts and code from Tasks 1–4.
- Produces: Evidence that the asset contract, UI contract, metadata, lint, build, and responsive rendering all pass together.

- [ ] **Step 1: Run all brand-specific tests together**

Run:

```bash
node --test src/app/brand-assets.test.mjs src/app/brand-ui.test.mjs
pnpm exec tsx --test src/app/components/BrandLockup.test.tsx src/app/manifest.test.ts
```

Expected: 14 tests PASS.

- [ ] **Step 2: Run affected existing component tests**

Run:

```bash
pnpm exec tsx --test src/app/components/Timeline.test.tsx src/app/watchlist/reviews/merge-records.test.ts
node --test src/app/lib/episode-log.test.mjs src/app/lib/feed-pagination.test.mjs
```

Expected: all existing tests PASS.

- [ ] **Step 3: Run repository-level frontend checks**

Run:

```bash
pnpm lint
pnpm build
```

Expected: lint exits with no errors and the Next.js production build completes successfully.

- [ ] **Step 4: Verify generated image dimensions independently**

Run:

```bash
/Users/yubeen/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -c "from pathlib import Path; from PIL import Image; expected={'pwa-192.png':(192,192),'pwa-512.png':(512,512),'pwa-maskable-192.png':(192,192),'pwa-maskable-512.png':(512,512),'apple-touch-icon.png':(180,180)}; root=Path('public/brand'); assert all(Image.open(root/name).size == size for name,size in expected.items()); print('brand image dimensions OK')"
```

Expected: prints `brand image dimensions OK`.

- [ ] **Step 5: Run responsive visual QA**

Run the app with:

```bash
pnpm dev
```

Inspect the site at desktop width and a 390px mobile viewport. Verify:

- The sticky navbar shows the 28px ribbon-A mark and live `AnimeSquad` text without overflow.
- The mobile drawer header uses the same lockup and closes after navigating home.
- Active navbar states use Brand Soft with Brand Strong text; inactive states remain neutral.
- Entry-flow CTAs on the landing, onboarding, invite, and squad pages use Brand Strong, remain readable on hover, and show a Brand Light keyboard focus ring.
- `/manifest.webmanifest`, `/brand/pwa-512.png`, `/brand/pwa-maskable-512.png`, `/brand/apple-touch-icon.png`, and `/favicon.ico` all return successfully.
- Circular and rounded-square previews of the maskable icon do not crop the A silhouette.

- [ ] **Step 6: Review the final diff for scope**

Run:

```bash
git status --short
git diff --check
git diff --stat HEAD~4..HEAD
```

Expected: only the files listed in this plan are changed by the four implementation commits; no unrelated neutral UI, error colors, or user files are modified.
