const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('apiFetch는 세션 쿠키와 JSON 본문을 API로 보낸다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../shared/api.js'), 'utf8');
  let request;
  const context = {
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
  });
});
