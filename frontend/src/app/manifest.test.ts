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
