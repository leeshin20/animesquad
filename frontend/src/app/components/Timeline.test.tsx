import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar, Timeline, type FeedItemWithSquad } from "./Timeline";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("uses the default avatar when the user has no profile image", () => {
  const html = renderToStaticMarkup(<Avatar name="Alice" url={null} />);

  assert.match(html, /src="\/default-avatar\.png"/);
  assert.match(html, /alt=""/);
});

test("keeps a user-provided profile image", () => {
  const html = renderToStaticMarkup(
    <Avatar name="Alice" url="https://images.example/alice.png" />
  );

  assert.match(html, /src="https:\/\/images\.example\/alice\.png"/);
  assert.doesNotMatch(html, /default-avatar\.png/);
  assert.match(html, /alt=""/);
});

const item: FeedItemWithSquad = {
  id: 1,
  type: "PROGRESS_UPDATED",
  actor: { id: 7, displayName: "Alice", avatarUrl: null },
  anime: null,
  payload: { progress: 3 },
  createdAt: "2026-07-17T00:00:00Z",
};

test("links the current user's avatar and name to the editable profile", () => {
  const html = renderToStaticMarkup(<Timeline items={[item]} currentUserId={7} />);

  assert.equal(html.match(/href="\/profile"/g)?.length, 2);
  assert.doesNotMatch(html, /href="\/users\/7"/);
});

test("keeps another user's avatar and name linked to the public profile", () => {
  const html = renderToStaticMarkup(<Timeline items={[item]} currentUserId={8} />);

  assert.equal(html.match(/href="\/users\/7"/g)?.length, 2);
  assert.doesNotMatch(html, /href="\/profile"/);
});
