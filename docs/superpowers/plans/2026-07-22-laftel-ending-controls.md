# Laftel Ending Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect only Laftel’s real `엔딩 스킵` and `바로 재생` controls while preserving all existing non-Laftel and video-fallback behavior.

**Architecture:** Extend each site’s ending-label rule with an optional exact-match mode. Laftel compares normalized `aria-label` and text independently for exact equality; Netflix and Crunchyroll retain their existing substring matching.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript, Node.js built-in test runner, ZIP

## Global Constraints

- Laftel recognizes exactly `엔딩 스킵` and `바로 재생`.
- Laftel no longer recognizes `엔딩 건너뛰기`, `크레딧 건너뛰기`, `다음 화`, or `다음화`.
- Keep the existing 50ms DOM mutation batching and one-second fallback scan unchanged.
- Keep the 90%-plus-30-seconds and `ended` video fallbacks unchanged.
- Do not change title parsing, playback URL restrictions, Netflix behavior, or Crunchyroll behavior.
- Regenerate the untracked distribution ZIP from verified production source without changing manifest version `1.0.1`.

---

### Task 1: Replace Laftel Ending Labels and Refresh the Package

**Files:**
- Modify: `chrome-extension/content/watch-detectors.js:6-43`
- Test: `chrome-extension/test/watch-detectors.test.js:20-55`
- Replace artifact: `chrome-extension.zip`

**Interfaces:**
- Consumes: `asqFindEndingControl(hostname, root, getStyle)` and candidate controls exposing `aria-label`, `textContent`, visibility, and dimensions.
- Produces: the same return contract—first matching visible control or `null`—with Laftel-only exact matching.

- [ ] **Step 1: Write failing Laftel control tests**

Replace the combined Netflix/Laftel test with a Netflix-preservation test and add focused Laftel tests:

```js
test('Netflix 엔딩 버튼의 기존 부분 일치를 유지한다', () => {
  const netflix = element({ ariaLabel: 'Skip Credits' });
  assert.strictEqual(
    asqFindEndingControl('www.netflix.com', { querySelectorAll: () => [netflix] }, visibleStyle),
    netflix
  );
});

test('라프텔은 엔딩 스킵과 바로 재생을 정확히 감지한다', () => {
  const endingSkip = element({ text: '엔딩 스킵' });
  const playNow = element({ ariaLabel: '바로 재생' });

  assert.strictEqual(
    asqFindEndingControl('laftel.net', { querySelectorAll: () => [endingSkip] }, visibleStyle),
    endingSkip
  );
  assert.strictEqual(
    asqFindEndingControl('laftel.net', { querySelectorAll: () => [playNow] }, visibleStyle),
    playNow
  );
});

test('라프텔은 이전 문구와 부분 일치 및 숨겨진 버튼을 감지하지 않는다', () => {
  const oldLabels = ['엔딩 건너뛰기', '크레딧 건너뛰기', '다음 화', '다음화']
    .map((text) => element({ text }));
  const partial = element({ text: '바로 재생 설정' });
  const hidden = element({ text: '엔딩 스킵', ariaHidden: 'true' });

  assert.strictEqual(
    asqFindEndingControl(
      'laftel.net',
      { querySelectorAll: () => [...oldLabels, partial, hidden] },
      visibleStyle
    ),
    null
  );
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node --test chrome-extension/test/watch-detectors.test.js`

Expected: the real Laftel-label test fails because `엔딩 스킵` and `바로 재생` are absent, while the rejection test fails because old substring labels still match.

- [ ] **Step 3: Implement Laftel-only exact matching**

Change only the Laftel rule:

```js
{
  host: 'laftel.net',
  labels: ['엔딩 스킵', '바로 재생'],
  exact: true,
},
```

Normalize text sources separately and choose exact or existing substring matching per rule:

```js
const labels = [
  control.getAttribute?.('aria-label') ?? '',
  control.textContent ?? '',
].map((label) => label.trim().toLowerCase());
const combinedLabel = labels.join(' ').trim();
const matches = rule.exact
  ? rule.labels.some((candidate) => labels.includes(candidate))
  : rule.labels.some((candidate) => combinedLabel.includes(candidate));
return matches && asqIsVisible(control, getStyle);
```

- [ ] **Step 4: Run focused and complete extension tests**

Run: `node --test chrome-extension/test/watch-detectors.test.js`

Expected: all detector tests pass.

Run: `node --test chrome-extension/test/*.test.js`

Expected: all extension tests pass with zero failures.

- [ ] **Step 5: Regenerate and verify the distribution ZIP**

Create a temporary ZIP from these explicit paths inside `chrome-extension/`:

```text
manifest.json
background/
content/
popup/
shared/
icons/
assets/
```

Replace `/Users/yubeen/animesquad/chrome-extension.zip` with the verified temporary archive. Confirm:

- `manifest.json` is at ZIP root and remains version `1.0.1`.
- No `test/`, `__MACOSX`, `.DS_Store`, or wrapping `chrome-extension/` directory exists.
- Archived production files are byte-identical to the current source.
- Archived `content/watch-detectors.js` contains `엔딩 스킵` and `바로 재생`, and its Laftel rule no longer contains the four old labels.

- [ ] **Step 6: Check scope and commit source changes**

Run: `git diff --check`

Expected: no output and exit code 0.

```bash
git add chrome-extension/content/watch-detectors.js chrome-extension/test/watch-detectors.test.js
git commit -m "fix(extension): detect Laftel ending controls"
```

Keep `chrome-extension.zip` untracked as the local distribution artifact.
