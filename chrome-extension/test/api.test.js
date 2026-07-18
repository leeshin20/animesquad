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

test('넷플릭스 서비스 전용 제목만 유효하지 않은 제목으로 판별한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../shared/api.js'), 'utf8');
  const context = {};
  vm.runInNewContext(
    `${source}\nglobalThis.testIsInvalidNetflixTitle = asqIsInvalidNetflixTitle;`,
    context
  );

  assert.strictEqual(context.testIsInvalidNetflixTitle('홈 - 넷플릭스'), true);
  assert.strictEqual(context.testIsInvalidNetflixTitle('Netflix'), true);
  assert.strictEqual(context.testIsInvalidNetflixTitle('담배 고양이'), false);
});
