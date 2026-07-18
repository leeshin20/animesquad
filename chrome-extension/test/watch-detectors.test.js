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
