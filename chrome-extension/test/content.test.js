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
  const videos = [];
  const scheduledCallbacks = [];
  let observerCallback;
  let intervalCallback;
  let now = 0;
  let controlScans = 0;

  const location = {
    hostname: host,
    href: `https://${host}/watch/episode-11`,
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
    title: "Frieren: Beyond Journey's End - Episode 11 - The Real Hero",
    documentElement: {},
    querySelectorAll(selector) {
      if (selector === 'video') return videos;
      controlScans += 1;
      return controls;
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
    setTimeout(callback) {
      scheduledCallbacks.push(callback);
      return scheduledCallbacks.length;
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
  const eventTypes = ['durationchange', 'ended', 'pause', 'play', 'seeked', 'seeking', 'timeupdate'];

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
