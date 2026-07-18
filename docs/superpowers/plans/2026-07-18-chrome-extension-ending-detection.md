# Chrome Extension Ending Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AnimeSquad's 10-minute page-residency trigger with site-specific ending-control detection plus a 90%-and-30-seconds playback fallback.

**Architecture:** Add one dependency-free content-script module for ending-control matching, main-video selection, and progress tracking. Keep `content/index.js` as the browser orchestration layer: it observes SPA/DOM changes, binds the active video, deduplicates signals per episode, and sends the existing `WATCHED` message. The Service Worker and user-confirmed recording flow remain unchanged.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript content scripts, DOM `MutationObserver`, HTMLMediaElement events, Node.js `node:test` and `vm`.

## Global Constraints

- Supported sites remain exactly Crunchyroll, Netflix, and 라프텔 for this change.
- An ending or credits control becoming visible is the primary completion signal.
- Crunchyroll must treat `aria-hidden="false"` as visible and `aria-hidden="true"` as hidden.
- Playback fallback requires a finite video duration of at least 300 seconds, progress of at least 90%, and 30 accumulated seconds of actual playback after the threshold.
- Pausing and buffering stop accumulation without erasing it; seeking below 90% resets it.
- `ended` is an immediate completion signal.
- Each parsed episode sends at most one `WATCHED` message until the URL or parsed title/episode changes.
- The extension must continue to require the user to press `기록하기`; this feature must not write a watch entry automatically.
- Do not add third-party dependencies or broaden extension permissions.

## File Structure

- Create `chrome-extension/content/watch-detectors.js` — pure-ish reusable detector functions and a CommonJS export for Node tests.
- Create `chrome-extension/test/watch-detectors.test.js` — unit coverage for site controls, video selection, and progress accumulation.
- Modify `chrome-extension/content/index.js` — DOM/video orchestration, SPA reset, event binding, and one-shot `WATCHED` dispatch.
- Modify `chrome-extension/test/content.test.js` — content-script integration coverage with controlled fake DOM and time.
- Modify `chrome-extension/manifest.json` — load `watch-detectors.js` before `index.js`.
- Modify `chrome-extension/popup/index.html` — replace the obsolete 10-minute helper text.
- Modify `chrome-extension/test/popup-markup.test.js` — guard the new helper text and reject the old copy.

---

### Task 1: Detector Primitives

**Files:**
- Create: `chrome-extension/content/watch-detectors.js`
- Create: `chrome-extension/test/watch-detectors.test.js`

**Interfaces:**
- Produces: `asqFindEndingControl(hostname, root, getStyle)` returning the first visible matching element or `null`.
- Produces: `asqSelectMainVideo(videos, getStyle)` returning the largest visible video at least 300 seconds long or `null`.
- Produces: `asqCreateProgressTracker()` returning `{ tick(sample), end(), reset(), snapshot() }`.
- `tick(sample)` consumes `{ currentTime, duration, paused, seeking, readyState, nowMs }` and returns `true` only on the transition to completion.

- [ ] **Step 1: Write failing detector tests**

Create `chrome-extension/test/watch-detectors.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');

const {
  asqFindEndingControl,
  asqSelectMainVideo,
  asqCreateProgressTracker,
} = require('../content/watch-detectors.js');

function element({ text = '', ariaLabel = '', ariaHidden = null, width = 100, height = 40 } = {}) {
  return {
    textContent: text,
    hidden: false,
    getAttribute(name) {
      if (name === 'aria-label') return ariaLabel || null;
      if (name === 'aria-hidden') return ariaHidden;
      return null;
    },
    getBoundingClientRect: () => ({ width, height }),
  };
}

const visibleStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });

test('Crunchyroll 크레딧 버튼은 aria-hidden=false일 때만 감지한다', () => {
  const hidden = element({ text: '크레딧 건너뛰기', ariaHidden: 'true' });
  const shown = element({ text: '크레딧 건너뛰기', ariaHidden: 'false' });
  const root = { querySelectorAll: () => [hidden, shown] };

  assert.strictEqual(asqFindEndingControl('www.crunchyroll.com', root, visibleStyle), shown);
});

test('Netflix와 라프텔의 엔딩 또는 다음 화 버튼을 감지한다', () => {
  const netflix = element({ ariaLabel: 'Skip Credits' });
  const laftel = element({ text: '다음 화' });

  assert.strictEqual(
    asqFindEndingControl('www.netflix.com', { querySelectorAll: () => [netflix] }, visibleStyle),
    netflix
  );
  assert.strictEqual(
    asqFindEndingControl('laftel.net', { querySelectorAll: () => [laftel] }, visibleStyle),
    laftel
  );
});

test('가장 큰 5분 이상 가시 영상을 본편으로 선택한다', () => {
  const shortAd = { duration: 120, hidden: false, getBoundingClientRect: () => ({ width: 1920, height: 1080 }) };
  const small = { duration: 1400, hidden: false, getBoundingClientRect: () => ({ width: 640, height: 360 }) };
  const main = { duration: 1400, hidden: false, getBoundingClientRect: () => ({ width: 1280, height: 720 }) };

  assert.strictEqual(asqSelectMainVideo([shortAd, small, main], visibleStyle), main);
});

test('90% 이후 실제 재생 30초가 누적될 때 한 번만 완료한다', () => {
  const tracker = asqCreateProgressTracker();
  const sample = {
    currentTime: 1260,
    duration: 1400,
    paused: false,
    seeking: false,
    readyState: 4,
  };

  assert.strictEqual(tracker.tick({ ...sample, nowMs: 0 }), false);
  for (let second = 1; second < 30; second += 1) {
    assert.strictEqual(tracker.tick({ ...sample, nowMs: second * 1000 }), false);
  }
  assert.strictEqual(tracker.tick({ ...sample, nowMs: 30_000 }), true);
  assert.strictEqual(tracker.tick({ ...sample, nowMs: 31_000 }), false);
});

test('일시정지와 버퍼링은 누적하지 않고 재생 재개 시 이어간다', () => {
  const tracker = asqCreateProgressTracker();
  const playing = {
    currentTime: 1260,
    duration: 1400,
    paused: false,
    seeking: false,
    readyState: 4,
  };

  for (let second = 0; second <= 10; second += 1) {
    tracker.tick({ ...playing, nowMs: second * 1000 });
  }
  tracker.tick({ ...playing, paused: true, nowMs: 20_000 });
  tracker.tick({ ...playing, paused: true, nowMs: 40_000 });
  tracker.tick({ ...playing, nowMs: 41_000 });
  assert.strictEqual(tracker.snapshot().playedSeconds, 11);
});

test('90% 아래로 탐색하면 누적 시간을 초기화한다', () => {
  const tracker = asqCreateProgressTracker();

  tracker.tick({ currentTime: 1260, duration: 1400, paused: false, seeking: false, readyState: 4, nowMs: 0 });
  tracker.tick({ currentTime: 1270, duration: 1400, paused: false, seeking: false, readyState: 4, nowMs: 10_000 });
  tracker.tick({ currentTime: 1000, duration: 1400, paused: false, seeking: true, readyState: 4, nowMs: 11_000 });

  assert.deepStrictEqual(tracker.snapshot(), { playedSeconds: 0, completed: false });
});

test('ended는 즉시 한 번만 완료한다', () => {
  const tracker = asqCreateProgressTracker();
  assert.strictEqual(tracker.end(), true);
  assert.strictEqual(tracker.end(), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test chrome-extension/test/watch-detectors.test.js
```

Expected: FAIL with `Cannot find module '../content/watch-detectors.js'`.

- [ ] **Step 3: Implement the detector primitives**

Create `chrome-extension/content/watch-detectors.js`:

```js
const ASQ_MIN_VIDEO_SECONDS = 300;
const ASQ_PROGRESS_THRESHOLD = 0.9;
const ASQ_REQUIRED_PLAY_SECONDS = 30;

const ASQ_ENDING_LABELS = [
  {
    host: 'crunchyroll.com',
    labels: ['skip credits', '크레딧 건너뛰기', '엔딩 건너뛰기'],
  },
  {
    host: 'netflix.com',
    labels: ['skip credits', 'next episode', '크레딧 건너뛰기', '다음 화', '다음화'],
  },
  {
    host: 'laftel.net',
    labels: ['엔딩 건너뛰기', '크레딧 건너뛰기', '다음 화', '다음화'],
  },
];

function asqIsVisible(element, getStyle) {
  if (!element || element.hidden || element.getAttribute?.('aria-hidden') === 'true') return false;
  const style = getStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function asqFindEndingControl(hostname, root, getStyle = getComputedStyle) {
  const rule = ASQ_ENDING_LABELS.find((candidate) => hostname.includes(candidate.host));
  if (!rule) return null;

  const controls = root.querySelectorAll('button, [role="button"], [aria-label]');
  return Array.from(controls).find((control) => {
    const label = `${control.getAttribute?.('aria-label') ?? ''} ${control.textContent ?? ''}`
      .trim()
      .toLowerCase();
    return rule.labels.some((candidate) => label.includes(candidate))
      && asqIsVisible(control, getStyle);
  }) ?? null;
}

function asqSelectMainVideo(videos, getStyle = getComputedStyle) {
  return Array.from(videos)
    .filter((video) => Number.isFinite(video.duration) && video.duration >= ASQ_MIN_VIDEO_SECONDS)
    .filter((video) => asqIsVisible(video, getStyle))
    .map((video) => {
      const rect = video.getBoundingClientRect();
      return { video, area: rect.width * rect.height };
    })
    .sort((left, right) => right.area - left.area)[0]?.video ?? null;
}

function asqCreateProgressTracker() {
  let playedSeconds = 0;
  let lastTickAt = null;
  let completed = false;

  function reset() {
    playedSeconds = 0;
    lastTickAt = null;
    completed = false;
  }

  function tick({ currentTime, duration, paused, seeking, readyState, nowMs }) {
    const eligible = Number.isFinite(duration)
      && duration >= ASQ_MIN_VIDEO_SECONDS
      && currentTime / duration >= ASQ_PROGRESS_THRESHOLD;

    if (!eligible) {
      playedSeconds = 0;
      lastTickAt = nowMs;
      return false;
    }
    if (completed) return false;
    if (paused || seeking || readyState < 3) {
      lastTickAt = nowMs;
      return false;
    }
    if (lastTickAt !== null) {
      playedSeconds += Math.min(Math.max((nowMs - lastTickAt) / 1000, 0), 2);
    }
    lastTickAt = nowMs;
    if (playedSeconds < ASQ_REQUIRED_PLAY_SECONDS) return false;
    completed = true;
    return true;
  }

  function end() {
    if (completed) return false;
    completed = true;
    return true;
  }

  return {
    tick,
    end,
    reset,
    snapshot: () => ({ playedSeconds, completed }),
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    asqFindEndingControl,
    asqSelectMainVideo,
    asqCreateProgressTracker,
  };
}
```

- [ ] **Step 4: Run detector tests**

Run:

```bash
node --test chrome-extension/test/watch-detectors.test.js
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit detector primitives**

```bash
git add chrome-extension/content/watch-detectors.js chrome-extension/test/watch-detectors.test.js
git commit -m "feat(extension): add ending and playback detectors"
```

---

### Task 2: Content-Script Orchestration and Deduplication

**Files:**
- Modify: `chrome-extension/content/index.js`
- Modify: `chrome-extension/manifest.json`
- Modify: `chrome-extension/test/content.test.js`

**Interfaces:**
- Consumes: `asqFindEndingControl`, `asqSelectMainVideo`, and `asqCreateProgressTracker` from Task 1 as content-script globals.
- Consumes: existing `asqParseTitle(hostname, title)` from `content/parsers.js`.
- Produces: exactly one `{ type: 'WATCHED', payload: { animeName, ep } }` per episode state.
- Preserves: existing Service Worker `WATCHED` handling without changes.

- [ ] **Step 1: Replace the old residency test with failing integration tests**

Replace `chrome-extension/test/content.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness({ host }) {
  const controls = [];
  const messages = [];
  const videoListeners = new Map();
  let observerCallback;
  let intervalCallback;
  let now = 0;

  const location = {
    hostname: host,
    href: `https://${host}/watch/episode-11`,
  };
  const video = {
    currentTime: 0,
    duration: 1400,
    paused: true,
    seeking: false,
    readyState: 4,
    hidden: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 1280, height: 720 }),
    addEventListener(type, listener) {
      videoListeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (videoListeners.get(type) === listener) videoListeners.delete(type);
    },
    dispatch(type) {
      videoListeners.get(type)?.();
    },
  };
  const document = {
    title: "Frieren: Beyond Journey's End - Episode 11 - The Real Hero",
    documentElement: {},
    querySelectorAll(selector) {
      return selector === 'video' ? [video] : controls;
    },
  };
  const context = vm.createContext({
    location,
    document,
    Date: { now: () => now },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    MutationObserver: class {
      constructor(callback) {
        observerCallback = callback;
      }
      observe() {}
    },
    setInterval(callback) {
      intervalCallback = callback;
      return 1;
    },
    chrome: {
      runtime: {
        sendMessage(message) {
          messages.push(plain(message));
        },
      },
    },
  });

  for (const sourcePath of [
    '../content/parsers.js',
    '../content/watch-detectors.js',
    '../content/index.js',
  ]) {
    const source = fs.readFileSync(path.join(__dirname, sourcePath), 'utf8');
    vm.runInContext(source, context);
  }

  return {
    controls,
    messages,
    video,
    location,
    document,
    control({ text, ariaHidden }) {
      return {
        textContent: text,
        ariaHidden,
        hidden: false,
        getAttribute(name) {
          if (name === 'aria-hidden') return this.ariaHidden;
          if (name === 'aria-label') return null;
          return null;
        },
        getBoundingClientRect: () => ({ width: 300, height: 60 }),
      };
    },
    mutate() {
      observerCallback();
    },
    runInterval() {
      intervalCallback();
    },
    tick(nowMs) {
      now = nowMs;
      intervalCallback();
    },
  };
}

test('Crunchyroll aria-hidden=false 엔딩 버튼은 WATCHED를 한 번만 보낸다', () => {
  const harness = createHarness({ host: 'www.crunchyroll.com' });
  const button = harness.control({ text: '크레딧 건너뛰기', ariaHidden: 'true' });
  harness.controls.push(button);
  harness.mutate();
  assert.deepStrictEqual(harness.messages, []);

  button.ariaHidden = 'false';
  harness.mutate();
  harness.mutate();
  assert.deepStrictEqual(harness.messages, [
    { type: 'WATCHED', payload: { animeName: "Frieren: Beyond Journey's End", ep: 11 } },
  ]);
});

test('90% 이후 30초 실제 재생은 WATCHED를 한 번만 보낸다', () => {
  const harness = createHarness({ host: 'www.crunchyroll.com' });
  harness.video.currentTime = 1260;
  harness.video.duration = 1400;
  harness.video.paused = false;

  for (let second = 0; second <= 31; second += 1) {
    harness.tick(second * 1000);
  }

  assert.strictEqual(harness.messages.length, 1);
  assert.strictEqual(harness.messages[0].type, 'WATCHED');
});

test('일시정지 시간과 90%로 탐색한 순간만으로는 WATCHED를 보내지 않는다', () => {
  const harness = createHarness({ host: 'www.crunchyroll.com' });
  harness.video.currentTime = 1260;
  harness.video.duration = 1400;
  harness.video.paused = true;

  for (let second = 0; second <= 40; second += 1) {
    harness.tick(second * 1000);
  }

  assert.deepStrictEqual(harness.messages, []);
});

test('ended와 엔딩 버튼이 함께 발생해도 중복 전송하지 않는다', () => {
  const harness = createHarness({ host: 'www.crunchyroll.com' });
  harness.video.dispatch('ended');
  harness.controls.push(harness.control({ text: '크레딧 건너뛰기', ariaHidden: 'false' }));
  harness.mutate();
  assert.strictEqual(harness.messages.length, 1);
});

test('SPA에서 다음 회차로 이동하면 새 회차를 다시 전송할 수 있다', () => {
  const harness = createHarness({ host: 'www.crunchyroll.com' });
  harness.controls.push(harness.control({ text: '크레딧 건너뛰기', ariaHidden: 'false' }));
  harness.mutate();

  harness.location.href = 'https://www.crunchyroll.com/watch/episode-12';
  harness.document.title = "Frieren: Beyond Journey's End - Episode 12 - The Real Hero";
  harness.runInterval();
  harness.mutate();

  assert.deepStrictEqual(harness.messages.map((message) => message.payload.ep), [11, 12]);
});
```

- [ ] **Step 2: Run content tests to verify the old implementation fails**

Run:

```bash
node --test chrome-extension/test/content.test.js
```

Expected: FAIL because the old content script still uses `MIN_WATCH_SECONDS` and `pagehide` and does not consume detector globals.

- [ ] **Step 3: Wire detectors into the content script**

Replace the 10-minute timer and `pagehide` notification in `chrome-extension/content/index.js` with this state machine:

```js
let lastUrl = location.href;
let lastParsed = asqParseTitle(location.hostname, document.title);
let episodeKey = asqEpisodeKey(lastParsed);
let notified = false;
let activeVideo = null;
let progressTracker = asqCreateProgressTracker();

function asqEpisodeKey(parsed) {
  return `${location.href}|${parsed?.animeName ?? ''}|${parsed?.ep ?? ''}`;
}

function resetEpisodeIfChanged() {
  const parsed = asqParseTitle(location.hostname, document.title);
  const nextKey = asqEpisodeKey(parsed);
  if (nextKey === episodeKey) return;
  episodeKey = nextKey;
  lastParsed = parsed;
  notified = false;
  progressTracker = asqCreateProgressTracker();
  bindVideo(null);
}

function notifyOnce() {
  if (notified || !lastParsed) return;
  notified = true;
  chrome.runtime.sendMessage({ type: 'WATCHED', payload: lastParsed });
}

function onVideoEnded() {
  if (progressTracker.end()) notifyOnce();
}

function bindVideo(video) {
  if (video === activeVideo) return;
  activeVideo?.removeEventListener('ended', onVideoEnded);
  activeVideo = video;
  activeVideo?.addEventListener('ended', onVideoEnded);
  progressTracker.reset();
}

function checkEndingControl() {
  if (asqFindEndingControl(location.hostname, document)) notifyOnce();
}

function checkVideoProgress() {
  const video = asqSelectMainVideo(document.querySelectorAll('video'));
  bindVideo(video);
  if (!video) return;
  if (progressTracker.tick({
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    seeking: video.seeking,
    readyState: video.readyState,
    nowMs: Date.now(),
  })) {
    notifyOnce();
  }
}

const pageObserver = new MutationObserver(() => {
  resetEpisodeIfChanged();
  checkEndingControl();
});

pageObserver.observe(document.documentElement, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['aria-hidden', 'hidden', 'class', 'style'],
});

setInterval(() => {
  if (location.href !== lastUrl) lastUrl = location.href;
  resetEpisodeIfChanged();
  checkEndingControl();
  checkVideoProgress();
}, 1000);

checkEndingControl();
checkVideoProgress();
```

Do not retain `MIN_WATCH_SECONDS`, `startTime`, `notifyIfWatched`, or the `pagehide` listener.

- [ ] **Step 4: Load the detector module in Manifest V3**

Change the `content_scripts[0].js` list in `chrome-extension/manifest.json` to:

```json
"js": [
  "content/parsers.js",
  "content/watch-detectors.js",
  "content/index.js"
]
```

Do not add permissions or `all_frames` in this task.

- [ ] **Step 5: Run focused content-script tests**

Run:

```bash
node --test chrome-extension/test/watch-detectors.test.js chrome-extension/test/content.test.js
```

Expected: all detector and content integration tests PASS.

- [ ] **Step 6: Run the existing background tests**

Run:

```bash
node --test chrome-extension/test/background.test.js
```

Expected: 2 tests PASS, proving the `WATCHED` message contract remains compatible.

- [ ] **Step 7: Commit content orchestration**

```bash
git add chrome-extension/content/index.js chrome-extension/manifest.json chrome-extension/test/content.test.js
git commit -m "feat(extension): trigger records at episode endings"
```

---

### Task 3: Popup Copy and Full Regression

**Files:**
- Modify: `chrome-extension/popup/index.html`
- Modify: `chrome-extension/test/popup-markup.test.js`

**Interfaces:**
- Preserves: popup view IDs and the existing `pending` record flow.
- Produces: user-facing copy that describes ending detection without promising automatic server recording.

- [ ] **Step 1: Add a failing copy test**

Append to `chrome-extension/test/popup-markup.test.js`:

```js
test('빈 상태 안내는 엔딩 감지 기준을 설명한다', () => {
  const html = fs.readFileSync(path.join(__dirname, '../popup/index.html'), 'utf8');

  assert.match(html, /엔딩 구간에 도달하면/);
  assert.doesNotMatch(html, /10분 이상/);
});
```

- [ ] **Step 2: Run the copy test to verify it fails**

Run:

```bash
node --test chrome-extension/test/popup-markup.test.js
```

Expected: FAIL because `popup/index.html` still says `10분 이상 보면`.

- [ ] **Step 3: Update the empty-state helper text**

In `chrome-extension/popup/index.html`, replace:

```html
<p class="hint">넷플릭스, 라프텔, 크런치롤에서 애니를 10분 이상 보면 여기서 기록할 수 있어요.</p>
```

with:

```html
<p class="hint">넷플릭스, 라프텔, 크런치롤에서 애니의 엔딩 구간에 도달하면 여기서 기록할 수 있어요.</p>
```

- [ ] **Step 4: Run popup tests**

Run:

```bash
node --test chrome-extension/test/popup-markup.test.js chrome-extension/test/popup.test.js
```

Expected: all popup tests PASS.

- [ ] **Step 5: Run the entire extension test suite**

Run:

```bash
node --test chrome-extension/test/*.test.js
```

Expected: all tests PASS with zero failures.

- [ ] **Step 6: Validate the manifest and removed threshold**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('chrome-extension/manifest.json', 'utf8')); console.log('manifest ok')"
rg -n "MIN_WATCH_SECONDS|10분 이상" chrome-extension
```

Expected: `manifest ok`; `rg` exits 1 with no matches.

- [ ] **Step 7: Perform manual browser checks**

Load `chrome-extension/` unpacked in `chrome://extensions` and verify:

1. Crunchyroll sends one record prompt when `크레딧 건너뛰기` changes to `aria-hidden="false"`.
2. Repeated DOM mutations while the button stays visible do not create another prompt.
3. Seeking directly past 90% does not immediately prompt; 30 seconds of actual playback does.
4. Pausing after 15 seconds and resuming later needs only the remaining 15 seconds.
5. Seeking back below 90% clears the accumulated fallback time.
6. Netflix and 라프텔 ending/next-episode controls create the same one-shot prompt.
7. Automatic next-episode navigation resets the one-shot state for the new episode.

- [ ] **Step 8: Commit copy and verification guard**

```bash
git add chrome-extension/popup/index.html chrome-extension/test/popup-markup.test.js
git commit -m "docs(extension): explain ending-based detection"
```

---

## Completion Criteria

- The 10-minute residency constant and `pagehide` trigger no longer exist.
- Crunchyroll `aria-hidden` visibility changes, Netflix/라프텔 ending labels, 90% plus 30 seconds, and `ended` all produce the existing `WATCHED` contract.
- Signals are deduplicated per episode and reset on SPA episode transitions.
- No new Chrome permissions or dependencies are introduced.
- All `chrome-extension/test/*.test.js` tests pass.
- Manual checks pass on all three supported streaming sites, with site selectors adjusted only inside `watch-detectors.js` if live DOM differs.
