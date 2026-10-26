const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness({
  host,
  href = `https://${host}/watch/episode-11`,
  title = "Frieren: Beyond Journey's End - Episode 11 - The Real Hero",
  metadata = {},
  autoResult = { status: 'saved' },
}) {
  const controls = [];
  const messages = [];
  const videos = [];
  const scheduledCallbacks = [];
  let messageListener;
  let observerCallback;
  let intervalCallback;
  let now = 0;
  let controlScans = 0;

  const location = {
    hostname: host,
    href,
  };
  function makeVideo({ width = 1280, height = 720 } = {}) {
    const listeners = new Map();
    return {
      currentTime: 0,
      duration: 1400,
      paused: true,
      seeking: false,
      readyState: 4,
      playbackRate: 1,
      hidden: false,
      getAttribute: () => null,
      getBoundingClientRect: () => ({ width, height }),
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      removeEventListener(type, listener) {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
      dispatch(type) {
        listeners.get(type)?.({ type });
      },
      listenerTypes() {
        return [...listeners.keys()].sort();
      },
    };
  }
  const video = makeVideo();
  videos.push(video);
  const document = {
    title,
    documentElement: {},
    querySelector(selector) {
      return metadata[selector] ?? null;
    },
    querySelectorAll(selector) {
      if (selector === 'video') return videos;
      controlScans += 1;
      return controls;
    },
  };
  const context = vm.createContext({
    location,
    document,
    metadata,
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
    setTimeout(callback) {
      scheduledCallbacks.push(callback);
      return scheduledCallbacks.length;
    },
    chrome: {
      runtime: {
        onMessage: { addListener: (listener) => { messageListener = listener; } },
        sendMessage(message) {
          messages.push(plain(message));
          return Promise.resolve(autoResult);
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
    inlineState() {
      let result;
      messageListener?.({ type: 'GET_INLINE_STATE' }, {}, (value) => { result = plain(value); });
      return result;
    },
    currentAnime() {
      let result;
      messageListener?.({ type: 'GET_CURRENT_ANIME' }, {}, (value) => { result = plain(value); });
      return result;
    },
    controls,
    messages,
    video,
    location,
    document,
    videos,
    makeVideo,
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
    flushScheduled() {
      while (scheduledCallbacks.length) scheduledCallbacks.shift()();
    },
    controlScans() {
      return controlScans;
    },
    runInterval() {
      intervalCallback();
    },
    tick(nowMs) {
      now = nowMs;
      intervalCallback();
    },
    setNow(nowMs) {
      now = nowMs;
    },
  };
}

test('Crunchyroll aria-hidden=false 엔딩 버튼은 WATCHED를 한 번만 보낸다', () => {
  const harness = createHarness({ host: 'www.crunchyroll.com' });
  const button = harness.control({ text: '크레딧 건너뛰기', ariaHidden: 'true' });
  harness.controls.push(button);
  harness.mutate();
  harness.flushScheduled();
  assert.deepStrictEqual(harness.messages, []);

  button.ariaHidden = 'false';
  harness.mutate();
  harness.mutate();
  harness.flushScheduled();
  assert.deepStrictEqual(harness.messages, [
    { type: 'WATCHED', payload: { animeName: "Frieren: Beyond Journey's End", ep: 11 } },
  ]);
});

test('미디어 timeupdate 이벤트로 90% 이후 30초 재생하면 WATCHED를 한 번만 보낸다', () => {
  const harness = createHarness({ host: 'www.crunchyroll.com' });
  harness.video.duration = 1400;
  harness.video.paused = false;

  for (let second = 0; second <= 31; second += 1) {
    harness.video.currentTime = 1260 + second;
    harness.setNow(second * 1000);
    harness.video.dispatch('timeupdate');
  }

  assert.strictEqual(harness.messages.length, 1);
  assert.strictEqual(harness.messages[0].type, 'WATCHED');
});

test('seeked 이벤트의 큰 시간 점프는 누적 재생을 즉시 완료하지 않는다', () => {
  const harness = createHarness({ host: 'www.crunchyroll.com' });
  harness.video.paused = false;

  for (let second = 0; second <= 29; second += 1) {
    harness.video.currentTime = 1260 + second;
    harness.setNow(second * 1000);
    harness.video.dispatch('timeupdate');
  }

  harness.video.currentTime = 1390;
  harness.setNow(30_000);
  harness.video.dispatch('seeked');

  assert.deepStrictEqual(harness.messages, []);
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
  harness.flushScheduled();
  assert.strictEqual(harness.messages.length, 1);
});

test('SPA 회차 전환 중 계속 보이는 이전 엔딩 버튼은 사라졌다 다시 나타난 뒤에만 전송한다', () => {
  const harness = createHarness({ host: 'www.crunchyroll.com' });
  const button = harness.control({ text: '크레딧 건너뛰기', ariaHidden: 'false' });
  harness.controls.push(button);
  harness.mutate();
  harness.flushScheduled();

  harness.location.href = 'https://www.crunchyroll.com/watch/episode-12';
  harness.document.title = "Frieren: Beyond Journey's End - Episode 12 - The Real Hero";
  harness.runInterval();
  harness.mutate();
  harness.flushScheduled();

  assert.deepStrictEqual(harness.messages.map((message) => message.payload.ep), [11]);

  button.ariaHidden = 'true';
  harness.mutate();
  harness.flushScheduled();
  button.ariaHidden = 'false';
  harness.mutate();
  harness.flushScheduled();

  assert.deepStrictEqual(harness.messages.map((message) => message.payload.ep), [11, 12]);
});

test('활성 비디오의 모든 미디어 이벤트를 바인딩하고 교체 시 이전 리스너를 제거한다', () => {
  const harness = createHarness({ host: 'www.crunchyroll.com' });
  const eventTypes = ['durationchange', 'ended', 'loadedmetadata', 'pause', 'play', 'seeked', 'seeking', 'timeupdate'];

  assert.deepStrictEqual(harness.video.listenerTypes(), eventTypes);

  const replacement = harness.makeVideo({ width: 1920, height: 1080 });
  harness.videos.push(replacement);
  harness.runInterval();

  assert.deepStrictEqual(harness.video.listenerTypes(), []);
  assert.deepStrictEqual(replacement.listenerTypes(), eventTypes);
  harness.video.dispatch('ended');
  assert.deepStrictEqual(harness.messages, []);
});

test('여러 DOM mutation을 한 번의 예약된 엔딩 컨트롤 스캔으로 합친다', () => {
  const harness = createHarness({ host: 'www.crunchyroll.com' });
  const scansBefore = harness.controlScans();

  harness.mutate();
  harness.mutate();
  harness.mutate();
  assert.strictEqual(harness.controlScans(), scansBefore);

  harness.flushScheduled();
  assert.strictEqual(harness.controlScans(), scansBefore + 1);
});

test('Netflix 홈 화면의 영상과 다음 화 UI는 WATCHED를 보내지 않는다', () => {
  const harness = createHarness({
    host: 'www.netflix.com',
    href: 'https://www.netflix.com/browse',
    title: '홈 - 넷플릭스',
  });
  harness.controls.push(harness.control({ text: '다음 화', ariaHidden: 'false' }));
  harness.mutate();
  harness.flushScheduled();
  harness.video.dispatch('ended');

  assert.deepStrictEqual(harness.messages, []);
});

test('Netflix 재생 화면은 DOM 작품명과 회차로 WATCHED를 보낸다', () => {
  const metadata = {
    '[data-uia="evidence-overlay-season-title"]': { textContent: '담배 고양이' },
    '[data-uia="evidence-overlay-episode-title"]': { textContent: '3화: 3화' },
  };
  const harness = createHarness({
    host: 'www.netflix.com',
    href: 'https://www.netflix.com/watch/81713945',
    title: 'Netflix',
    metadata,
  });
  delete metadata['[data-uia="evidence-overlay-season-title"]'];
  delete metadata['[data-uia="evidence-overlay-episode-title"]'];
  harness.controls.push(harness.control({ text: '다음 화', ariaHidden: 'false' }));
  harness.mutate();
  harness.flushScheduled();

  assert.deepStrictEqual(harness.messages, [
    { type: 'WATCHED', payload: { animeName: '담배 고양이', ep: 3 } },
  ]);
});

test('Netflix 메타데이터와 엔딩 UI가 늦게 함께 나타나도 WATCHED를 보낸다', () => {
  const metadata = {};
  const harness = createHarness({
    host: 'www.netflix.com',
    href: 'https://www.netflix.com/watch/81713945',
    title: 'Netflix',
    metadata,
  });
  metadata['[data-uia="evidence-overlay-season-title"]'] = { textContent: '담배 고양이' };
  metadata['[data-uia="evidence-overlay-episode-title"]'] = { textContent: '3화: 3화' };
  harness.controls.push(harness.control({ text: '다음 화', ariaHidden: 'false' }));
  harness.mutate();
  harness.flushScheduled();

  assert.deepStrictEqual(harness.messages, [
    { type: 'WATCHED', payload: { animeName: '담배 고양이', ep: 3 } },
  ]);
});


test('팝업 조회는 엔딩 전 라프텔 작품과 회차를 반환하고 기록 알림은 보내지 않는다', () => {
  const h = createHarness({ host: 'laftel.net', href: 'https://laftel.net/player/41666/65123', title: '(자막) 장송의 프리렌 1화 다시보기 | 라프텔' });
  assert.deepStrictEqual(h.currentAnime(), { platform: '라프텔', animeName: '(자막) 장송의 프리렌', ep: 1 });
  assert.deepStrictEqual(h.messages, []);
  h.location.href = 'https://laftel.net/player/41666/65124';
  h.document.title = '(자막) 장송의 프리렌 2화 다시보기 | 라프텔';
  assert.strictEqual(h.currentAnime().ep, 2);
});

test('감지 정보 조회 시 재생 페이지를 떠나거나 제목이 사라지면 이전 작품을 반환하지 않는다', () => {
  const h = createHarness({ host: 'laftel.net', href: 'https://laftel.net/player/41666/65123', title: '장송의 프리렌 1화' });
  assert.strictEqual(h.currentAnime()?.ep, 1);
  h.document.title = '';
  assert.strictEqual(h.currentAnime(), null);
  h.document.title = '장송의 프리렌 1화';
  h.location.href = 'https://laftel.net/item/41666';
  assert.strictEqual(h.currentAnime(), null);
});

test('넷플릭스와 크런치롤의 현재 작품도 조회하며 홈 화면은 제외한다', () => {
  const netflix = createHarness({ host: 'www.netflix.com', title: 'Episode 11 | 장송의 프리렌 | Netflix' });
  assert.deepStrictEqual(netflix.currentAnime(), { platform: '넷플릭스', animeName: '장송의 프리렌', ep: 11 });
  const crunchy = createHarness({ host: 'www.crunchyroll.com' });
  assert.strictEqual(crunchy.currentAnime()?.platform, '크런치롤');
  crunchy.location.href = 'https://www.crunchyroll.com/';
  assert.strictEqual(crunchy.currentAnime(), null);
});


test('언어 경로가 포함된 크런치롤 재생 페이지에서도 현재 작품을 표시한다', () => {
  for (const locale of ['ko', 'en-US', 'es-419']) {
    const h = createHarness({ host: 'www.crunchyroll.com', href: `https://www.crunchyroll.com/${locale}/watch/G2XU04E88/the-journeys-end` });
    assert.deepStrictEqual(h.currentAnime(), { platform: '크런치롤', animeName: "Frieren: Beyond Journey's End", ep: 11 });
  }
});


test('inline readiness belongs to current Laftel episode and resets on navigation', () => {
  const h = createHarness({ host: 'laftel.net', href: 'https://laftel.net/player/41666/65123', title: '장송의 프리렌 1화' });
  assert.strictEqual(h.inlineState()?.readyToRecord, false);
  h.video.paused = false;
  h.video.currentTime = 1120;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.inlineState().readyToRecord, true);
  h.location.href = 'https://laftel.net/player/41666/65124';
  h.document.title = '장송의 프리렌 2화';
  assert.strictEqual(h.inlineState().readyToRecord, false);
  assert.strictEqual(h.inlineState().ep, 2);
});


function laftelAutoHarness(options = {}) {
  return createHarness({ host: 'laftel.net', href: 'https://laftel.net/player/41666/65123', title: '(자막) 장송의 프리렌 1화 다시보기 | 라프텔', ...options });
}
test('Laftel automatically sends one record request at 80%, not 79%', async () => {
  const h = laftelAutoHarness(); h.video.paused = false;
  h.video.currentTime = 1106; h.video.dispatch('timeupdate');
  assert.strictEqual(h.messages.length, 0);
  h.video.currentTime = 1120; h.video.dispatch('timeupdate'); h.runInterval();
  await new Promise((r) => setImmediate(r)); h.runInterval();
  assert.deepStrictEqual(h.messages, [{ type: 'LAFTEL_AUTO_RECORD' }]);
  assert.strictEqual(h.inlineState().autoRecordStatus, 'saved');
});
test('paused or seeking 80% samples do not automatically record', () => {
  for (const sample of [{ paused: true }, { paused: false, seeking: true }, { paused: false, readyState: 1 }]) {
    const h = laftelAutoHarness(); Object.assign(h.video, { currentTime: 1120 }, sample); h.video.dispatch('timeupdate');
    assert.strictEqual(h.messages.length, 0);
  }
});
test('failed automatic records retry no more than once per minute', async () => {
  const h = laftelAutoHarness({ autoResult: { status: 'failed' } });
  h.video.paused = false; h.video.currentTime = 1120; h.tick(0);
  await new Promise((r) => setImmediate(r)); h.tick(59999);
  assert.strictEqual(h.messages.length, 1);
  h.tick(60000); assert.strictEqual(h.messages.length, 2);
});
test('SPA retains old media position until new episode media resets before arming auto record', async () => {
  const h = laftelAutoHarness(); h.video.paused = false; h.video.currentTime = 1120; h.tick(0);
  await new Promise((r) => setImmediate(r));
  h.location.href = 'https://laftel.net/player/41666/65124'; h.document.title = '(자막) 장송의 프리렌 2화'; h.tick(1000);
  assert.strictEqual(h.messages.length, 1);
  h.video.currentTime = 0; h.tick(2000); h.video.currentTime = 1120; h.tick(3000);
  assert.strictEqual(h.messages.length, 2);
});
