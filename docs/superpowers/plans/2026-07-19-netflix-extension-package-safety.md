# Netflix Extension Package Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject invalid Netflix home-page watch events, clear stale invalid pending data, and ship a clean version 1.0.1 extension archive containing the current detection code.

**Architecture:** Keep Content Script detection and its 50ms mutation batching unchanged. Add validation at the Service Worker message boundary and at Popup initialization, then package the verified source with `manifest.json` at the ZIP root.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript, Node.js built-in test runner, ZIP

## Global Constraints

- Keep the existing 50ms DOM mutation batching unchanged.
- Accept Netflix automatic records only from `/watch/` pages with a real work title.
- Preserve normal pending records and all non-Netflix site behavior.
- Package version must be exactly `1.0.1`.
- The distribution ZIP must place `manifest.json` at its root and exclude tests and macOS metadata.

---

### Task 1: Validate WATCHED Messages at the Service Worker Boundary

**Files:**
- Modify: `chrome-extension/shared/api.js`
- Modify: `chrome-extension/background/service-worker.js:1-25`
- Test: `chrome-extension/test/api.test.js`
- Test: `chrome-extension/test/background.test.js`

**Interfaces:**
- Consumes: Chrome `runtime.onMessage` messages shaped as `{ type: 'WATCHED', payload: { animeName, ep } }` and `sender.tab.url`.
- Produces: shared `asqIsInvalidNetflixTitle(animeName): boolean` and Service Worker `asqShouldIgnoreWatchedMessage(msg, sender): boolean`, used before search, storage, and popup operations.

- [ ] **Step 1: Write failing tests for Netflix home and generic-title events**

Add API helper assertions for both invalid and normal titles:

```js
assert.strictEqual(asqIsInvalidNetflixTitle('홈 - 넷플릭스'), true);
assert.strictEqual(asqIsInvalidNetflixTitle('Netflix'), true);
assert.strictEqual(asqIsInvalidNetflixTitle('담배 고양이'), false);
```

Append background tests that execute the Service Worker, send these two inputs, and assert that search, `storage.local.set`, and `action.openPopup` are never called:

```js
listener(
  { type: 'WATCHED', payload: { animeName: '홈 - 넷플릭스', ep: null } },
  { tab: { url: 'https://www.netflix.com/browse', windowId: 42 } }
);

listener(
  { type: 'WATCHED', payload: { animeName: 'Netflix', ep: null } },
  { tab: { url: 'https://www.netflix.com/watch/81713945', windowId: 42 } }
);
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node --test chrome-extension/test/background.test.js`

Expected: the new assertions fail because both messages currently reach search and popup handling.

- [ ] **Step 3: Add the minimal Service Worker guard**

Add the title predicate to `shared/api.js`, which is already loaded by both the Service Worker and Popup:

```js
function asqIsInvalidNetflixTitle(animeName) {
  const normalized = animeName?.trim() ?? '';
  return /^(?:홈\s*[-–]\s*)?(?:넷플릭스|Netflix)$/i.test(normalized);
}
```

Add a Service Worker predicate before the listener and call it immediately after checking `msg.type`:

```js
function asqShouldIgnoreWatchedMessage(msg, sender) {
  const tabUrl = sender?.tab?.url ?? '';
  const isNetflix = /^https:\/\/(?:[^/]+\.)?netflix\.com(?:\/|$)/i.test(tabUrl);
  if (!isNetflix) return false;

  const path = tabUrl.match(/^https?:\/\/[^/]+([^?#]*)/i)?.[1] ?? '';
  return !path.startsWith('/watch/')
    || asqIsInvalidNetflixTitle(msg.payload?.animeName);
}
```

Use it as follows:

```js
if (msg.type !== 'WATCHED' || asqShouldIgnoreWatchedMessage(msg, sender)) return;
```

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `node --test chrome-extension/test/background.test.js`

Expected: all background tests pass, including a normal Netflix `/watch/` message using a real title.

- [ ] **Step 5: Commit Task 1**

```bash
git add chrome-extension/shared/api.js chrome-extension/background/service-worker.js chrome-extension/test/api.test.js chrome-extension/test/background.test.js
git commit -m "fix(extension): reject invalid Netflix watch events"
```

---

### Task 2: Remove Stale Invalid Netflix Pending Data

**Files:**
- Modify: `chrome-extension/popup/popup.js:20-42`
- Test: `chrome-extension/test/popup.test.js:54-107`

**Interfaces:**
- Consumes: stored `pending` shaped as `{ animeName, ep, results }`.
- Consumes: shared `asqIsInvalidNetflixTitle(animeName): boolean` from `shared/api.js`.
- Produces: invalid service-only Netflix titles are removed and route to `view-empty`.

- [ ] **Step 1: Write a failing Popup initialization test**

Create a harness with the stale value and verify initialization removes `pending`, shows the empty view, and does not show the record view:

```js
const harness = popupContext(async () => ({ ok: true }), {
  pending: { animeName: '홈 - 넷플릭스', ep: null, results: [] },
});

vm.runInNewContext(source, harness.context);
await new Promise((resolve) => setImmediate(resolve));

assert.strictEqual(harness.removedKey, 'pending');
assert.strictEqual(harness.elements['view-empty'].classNames.has('hidden'), false);
assert.strictEqual(harness.elements['view-record'].classNames.has('hidden'), true);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test chrome-extension/test/popup.test.js`

Expected: the new test fails because initialization currently calls `loadRecord()` for every pending value.

- [ ] **Step 3: Add the minimal stale-pending check**

Add this branch in `init()`:

```js
if (asqIsInvalidNetflixTitle(pending?.animeName)) {
  await chrome.storage.local.remove('pending');
  showView('view-empty');
  return;
}
```

- [ ] **Step 4: Run Popup tests and confirm GREEN**

Run: `node --test chrome-extension/test/popup.test.js`

Expected: all Popup tests pass and existing valid pending tests remain unchanged.

- [ ] **Step 5: Commit Task 2**

```bash
git add chrome-extension/popup/popup.js chrome-extension/test/popup.test.js
git commit -m "fix(extension): clear invalid Netflix pending records"
```

---

### Task 3: Version and Package the Verified Extension

**Files:**
- Modify: `chrome-extension/manifest.json:4`
- Modify: `chrome-extension/test/brand-assets.test.js`
- Replace artifact: `chrome-extension.zip`

**Interfaces:**
- Consumes: verified files under `chrome-extension/`.
- Produces: Chrome distribution archive `chrome-extension.zip` with root-level `manifest.json` and version `1.0.1`.

- [ ] **Step 1: Write a failing manifest-version test**

Add:

```js
test('manifest uses the packaged extension version', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.version, '1.0.1');
});
```

- [ ] **Step 2: Run the manifest test and confirm RED**

Run: `node --test chrome-extension/test/brand-assets.test.js`

Expected: FAIL with actual version `1.0.0`.

- [ ] **Step 3: Set the manifest version**

Change only:

```json
"version": "1.0.1"
```

- [ ] **Step 4: Run the complete extension test suite**

Run: `node --test chrome-extension/test/*.test.js`

Expected: all tests pass with zero failures.

- [ ] **Step 5: Create a clean archive from explicit production paths**

From `chrome-extension/`, create `/private/tmp/animesquad-extension-1.0.1.zip` containing only:

```text
manifest.json
background/
content/
popup/
shared/
icons/
assets/
```

Then replace `/Users/yubeen/animesquad/chrome-extension.zip` with that verified temporary archive. Do not include `test/`, `.DS_Store`, `__MACOSX`, or a wrapping `chrome-extension/` directory.

- [ ] **Step 6: Verify archive structure and code freshness**

Run:

```bash
unzip -l chrome-extension.zip
unzip -p chrome-extension.zip manifest.json
unzip -p chrome-extension.zip content/index.js
```

Expected:

- `manifest.json` is at ZIP root and reports `1.0.1`.
- No `test/`, `__MACOSX`, or wrapping directory is present.
- `content/index.js` contains `asqParseCurrentPage` and not `MIN_WATCH_SECONDS`.

- [ ] **Step 7: Check the final diff and commit source changes**

Run: `git diff --check`

Expected: no output and exit code 0.

```bash
git add chrome-extension/manifest.json chrome-extension/test/brand-assets.test.js
git commit -m "chore(extension): package version 1.0.1"
```

The untracked distribution ZIP remains a local deliverable and is not added unless repository policy changes.
