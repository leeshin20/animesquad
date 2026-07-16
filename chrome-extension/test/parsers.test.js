const test = require('node:test');
const assert = require('node:assert');
const { asqParseTitle } = require('../content/parsers.js');

test('크런치롤: 에피소드 있는 제목', () => {
  assert.deepStrictEqual(
    asqParseTitle('www.crunchyroll.com', "Frieren: Beyond Journey's End - Episode 11 - A Real Hero"),
    { animeName: "Frieren: Beyond Journey's End", ep: 11 }
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
