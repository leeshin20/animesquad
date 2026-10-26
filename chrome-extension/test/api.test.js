const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('apiFetch는 세션 쿠키와 JSON 본문을 API로 보낸다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../shared/api.js'), 'utf8');
  let request;
  const timeoutSignal = {};
  const context = {
    AbortSignal: { timeout: (milliseconds) => {
      assert.strictEqual(milliseconds, 15000);
      return timeoutSignal;
    } },
    fetch: async (...args) => {
      request = args;
      return { ok: true };
    },
  };
  vm.runInNewContext(`${source}\nglobalThis.testApiFetch = apiFetch;`, context);

  await context.testApiFetch('/api/watch', {
    method: 'POST',
    body: { animeId: 7, status: 'WATCHING' },
  });

  assert.strictEqual(request[0], 'https://api.animesquad.me/api/watch');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(request[1])), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{"animeId":7,"status":"WATCHING"}',
    signal: timeoutSignal,
  });
});

test('넷플릭스 서비스 전용 제목과 빈 제목을 유효하지 않은 제목으로 판별한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../shared/api.js'), 'utf8');
  const context = {};
  vm.runInNewContext(
    `${source}\nglobalThis.testIsInvalidNetflixTitle = asqIsInvalidNetflixTitle;`,
    context
  );

  assert.strictEqual(context.testIsInvalidNetflixTitle('홈 - 넷플릭스'), true);
  assert.strictEqual(context.testIsInvalidNetflixTitle('Netflix'), true);
  assert.strictEqual(context.testIsInvalidNetflixTitle('   '), true);
  assert.strictEqual(context.testIsInvalidNetflixTitle(undefined), true);
  assert.strictEqual(context.testIsInvalidNetflixTitle(42), true);
  assert.strictEqual(context.testIsInvalidNetflixTitle({ title: '담배 고양이' }), true);
  assert.strictEqual(context.testIsInvalidNetflixTitle('담배 고양이'), false);
});

test('platform lookup returns the resolved anime and treats only 404 as absent', async () => {
  const requests = [];
  let response = { ok: true, json: async () => ({ id: 1516, titleKorean: '장송의 프리렌' }) };
  const context = { AbortSignal, fetch: async (...args) => { requests.push(args); return response; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shared/api.js'), 'utf8'), context);
  const anime = await context.findPlatformAnime({ platform: 'LAFTEL', platformAnimeId: '41666' });
  assert.strictEqual(anime.id, 1516);
  assert.strictEqual(requests[0][0], 'https://api.animesquad.me/api/anime/platform-links/LAFTEL/41666');
  response = { ok: false, status: 404 };
  assert.strictEqual(await context.findPlatformAnime({ platform: 'LAFTEL', platformAnimeId: '41666' }), null);
  response = { ok: false, status: 503 };
  await assert.rejects(() => context.findPlatformAnime({ platform: 'LAFTEL', platformAnimeId: '41666' }), /503/);
});
