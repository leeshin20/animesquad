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
