import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WatchEpisodeAction } from "./WatchEpisodeAction";
import { EpisodeLogModal } from "./EpisodeLogModal";
import type { WatchEntry } from "@/app/lib/api";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const entry = { id: 1, progress: 4, anime: { id: 10, titleRomaji: "Frieren", episodes: 12 } } as WatchEntry;

test("watch action defaults to next episode without showing a review form", () => {
  const html = renderToStaticMarkup(<WatchEpisodeAction entry={entry} onSaved={() => {}} />);
  assert.match(html, /5화 시청함/);
  assert.match(html, /감상 남기기/);
  assert.doesNotMatch(html, /textarea|평점 \(선택\)/);
});

test("reviewing an observed episode does not select the next episode", () => {
  const html = renderToStaticMarkup(<EpisodeLogModal entry={entry} initialEpisode={2} onSaved={() => {}} onClose={() => {}} />);
  assert.match(html, /value="2"/);
  assert.doesNotMatch(html, /value="5"/);
});
