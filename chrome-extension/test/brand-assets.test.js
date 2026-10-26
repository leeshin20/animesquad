const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const extensionRoot = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(extensionRoot, relativePath));
}

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test('popup brand mark uses the approved flat palette', () => {
  const svg = read('assets/logo-mark.svg').toString('utf8');

  assert.match(svg, /viewBox="0 0 96 96"/);
  assert.match(svg, /#22C55E/);
  assert.match(svg, /#15803D/);
  assert.match(svg, /#4ADE80/);
  assert.doesNotMatch(svg, /linearGradient|filter|shadow/);
});

for (const size of [16, 32, 48, 128]) {
  test(`icon${size}.png is a ${size}px square PNG`, () => {
    assert.deepEqual(pngDimensions(read(`icons/icon${size}.png`)), {
      width: size,
      height: size,
    });
  });
}

test('manifest declares every Chrome icon size', () => {
  const manifest = JSON.parse(read('manifest.json').toString('utf8'));
  const icons = {
    '16': 'icons/icon16.png',
    '32': 'icons/icon32.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  };

  assert.deepEqual(manifest.icons, icons);
  assert.deepEqual(manifest.action.default_icon, icons);
});

test('manifest uses the packaged extension version', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.version, '1.0.2');
});
