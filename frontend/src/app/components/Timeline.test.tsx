import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar } from "./Timeline";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("uses the default avatar when the user has no profile image", () => {
  const html = renderToStaticMarkup(<Avatar name="Alice" url={null} />);

  assert.match(html, /src="\/default-avatar\.png"/);
});

test("keeps a user-provided profile image", () => {
  const html = renderToStaticMarkup(
    <Avatar name="Alice" url="https://images.example/alice.png" />
  );

  assert.match(html, /src="https:\/\/images\.example\/alice\.png"/);
  assert.doesNotMatch(html, /default-avatar\.png/);
});
