const test = require('node:test');
const assert = require('node:assert');
const {
  asqParseTitle,
  asqParsePage,
  asqIsWatchPage,
} = require('../content/parsers.js');

test('크런치롤: 에피소드 있는 제목', () => {
  assert.deepStrictEqual(
    asqParseTitle('www.crunchyroll.com', "Frieren: Beyond Journey's End - Episode 11 - A Real Hero"),
    { animeName: "Frieren: Beyond Journey's End", ep: 11 }
  );
});

test('크런치롤: 한국어 제N화 제목에서 작품명과 회차만 분리한다', () => {
  assert.deepStrictEqual(
    asqParseTitle(
      'www.crunchyroll.com',
      '깨끗하게 해주시겠어요? 제2화 천연 온천이 자랑이라서 - 크런치롤에서 시청하세요'
    ),
    { animeName: '깨끗하게 해주시겠어요?', ep: 2 }
  );
});

test('넷플릭스: 에피소드 있는 제목', () => {
  assert.deepStrictEqual(
    asqParseTitle('www.netflix.com', "Episode 11 | Frieren: Beyond Journey's End | Netflix"),
    { animeName: "Frieren: Beyond Journey's End", ep: 11 }
  );
});

test('넷플릭스: 에피소드 없는 제목', () => {
  assert.deepStrictEqual(
    asqParseTitle('www.netflix.com', "Frieren: Beyond Journey's End | Netflix"),
    { animeName: "Frieren: Beyond Journey's End", ep: null }
  );
});

test('넷플릭스: 플레이어 DOM에서 작품명과 회차를 추출한다', () => {
  const elements = {
    '[data-uia="evidence-overlay-season-title"]': { textContent: '담배 고양이' },
    '[data-uia="evidence-overlay-episode-title"]': { textContent: '3화: 3화' },
  };
  const root = { querySelector: (selector) => elements[selector] ?? null };

  assert.deepStrictEqual(
    asqParsePage('www.netflix.com', 'Netflix', root),
    { animeName: '담배 고양이', ep: 3 }
  );
});

test('넷플릭스: 일반 화면은 시청 페이지로 판단하지 않는다', () => {
  assert.strictEqual(
    asqIsWatchPage('www.netflix.com', 'https://www.netflix.com/browse'),
    false
  );
  assert.strictEqual(
    asqIsWatchPage('www.netflix.com', 'https://www.netflix.com/watch/81713945'),
    true
  );
});

test('라프텔: 화수 있는 제목', () => {
  assert.deepStrictEqual(
    asqParseTitle('laftel.net', '장송의 프리렌 11화 - 라프텔'),
    { animeName: '장송의 프리렌', ep: 11 }
  );
});

test('라프텔: 화수 없는 제목', () => {
  assert.deepStrictEqual(
    asqParseTitle('laftel.net', '장송의 프리렌 - 라프텔'),
    { animeName: '장송의 프리렌', ep: null }
  );
});

test('지원하지 않는 호스트는 null', () => {
  assert.strictEqual(asqParseTitle('www.youtube.com', '아무 제목'), null);
});
