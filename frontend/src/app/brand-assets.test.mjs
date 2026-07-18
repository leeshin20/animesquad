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
