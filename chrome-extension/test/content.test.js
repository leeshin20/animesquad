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
