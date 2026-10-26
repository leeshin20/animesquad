const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const url = 'https://laftel.net/player/41666/65123';
function harness({ mapped = true, results = [], auth = 200, write = 200, link = 204, stale = false, cleanupError = false } = {}) {
  let listener;
  const requests = [];
  let stored;
  const state = { episodeUrl: url, animeName: '(자막) 장송의 프리렌', ep: 1, readyToRecord: true,
    autoRecordEligible: true, playback: { currentTime: 1152, duration: 1440, paused: false, seeking: false, readyState: 4 } };
  const context = { AbortSignal, importScripts() {},
    fetch: async (uri, options) => {
      const request = { path: uri.replace('https://api.animesquad.me', ''), ...options };
      requests.push(request);
      if (request.path === '/api/me') return { ok: auth === 200, status: auth, json: async () => ({ id: 7 }) };
      if (request.path.includes('/platform-links/')) {
        if (stale) state.episodeUrl = url + '4';
        return { ok: mapped, status: mapped ? 200 : 404, json: async () => ({ id: 1516, titleKorean: '장송의 프리렌' }) };
      }
      if (request.path.includes('/search')) return { ok: true, json: async () => results };
      const status = request.path.endsWith('/progress') ? write : link;
      return { ok: status < 300, status, json: async () => ({ progress: 1 }) };
    },
    chrome: {
      runtime: { getURL: (p) => 'chrome-extension://test/' + p, onMessage: { addListener: (fn) => { listener = fn; } } },
      tabs: { sendMessage: async () => JSON.parse(JSON.stringify(state)) },
      storage: { local: { get: async () => { if (cleanupError) throw new Error('storage unavailable'); return { pending: stored }; }, set: async (value) => { stored = value.pending; }, remove: async () => { stored = null; } } },
      action: { setBadgeText() {} },
    },
  };
  for (const file of ['shared/api.js', 'content/watch-detectors.js', 'background/service-worker.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return { state, requests, get pending() { return stored; },
    get writes() { return requests.filter((r) => r.method === 'POST'); },
    async record(sender = { url, frameId: 0, tab: { id: 1, url } }) {
      let result;
      listener({ type: 'LAFTEL_AUTO_RECORD', animeId: 999, ep: 99 }, sender, (r) => { result = r; });
      await new Promise((r) => setImmediate(r));
      return result;
    },
  };
}

test('80% automatic record uses trusted ID/episode and advance-only endpoint', async () => {
  const h = harness();
  assert.equal((await h.record())?.status, 'saved');
  assert.deepEqual(h.writes.map((r) => [r.path, JSON.parse(r.body)]), [['/api/watch/1516/progress', { progress: 1 }]]);
  assert.equal(h.requests.some((r) => r.path.includes('/search')), false);
});
test('unknown ID permits one exact alias match instead of first spinoff result', async () => {
  const h = harness({ mapped: false, results: [{ id: 9, titleKorean: '장송의 프리렌 미니애니' },
    { id: 1516, titleKorean: '장송의 프리렌', searchKeywords: '(자막) 장송의 프리렌' }] });
  assert.equal((await h.record())?.status, 'saved');
  assert.equal(h.writes[0].path, '/api/watch/1516/progress');
  assert.equal(h.writes[1].path, '/api/anime/1516/platform-links');
});
test('unmatched or ambiguous works require manual correction without writes', async () => {
  for (const results of [[], [{ id: 9, titleKorean: '프리렌 미니애니' }],
    [{ id: 1, titleKorean: '(자막) 장송의 프리렌' }, { id: 2, titleKorean: '(자막) 장송의 프리렌' }]]) {
    const h = harness({ mapped: false, results });
    assert.equal((await h.record())?.status, 'needs-match');
    assert.equal(h.writes.length, 0);
    assert.equal(h.pending?.ep, 1, 'manual toolbar correction remains available');
  }
});
test('anonymous, unready media and missing episode never cause automatic writes', async () => {
  const anonymous = harness({ auth: 401 });
  assert.equal((await anonymous.record())?.status, 'login-required');
  assert.equal(anonymous.writes.length, 0);
  for (const change of [{ ep: null }, { autoRecordEligible: false }, { playback: { currentTime: 100, duration: 1440 } }]) {
    const h = harness(); Object.assign(h.state, change);
    await h.record(); assert.equal(h.writes.length, 0);
  }
});
test('non-Laftel, subframe and stale navigation cannot auto-write a different episode', async () => {
  for (const sender of [{ url: 'https://example.com', frameId: 0, tab: { id: 1, url } },
    { url, frameId: 1, tab: { id: 1, url } }, { url: 'https://laftel.net/item/41666', frameId: 0, tab: { id: 1, url: 'https://laftel.net/item/41666' } }]) {
    const h = harness(); await h.record(sender); assert.equal(h.writes.length, 0);
  }
  const h = harness({ stale: true }); await h.record(); assert.equal(h.writes.length, 0);
});
test('failed progress is retryable; failed link learning still reports successful progress', async () => {
  const failed = harness({ write: 503 });
  assert.equal((await failed.record())?.status, 'failed');
  for (const link of [409, 503]) {
    const h = harness({ mapped: false, results: [{ id: 1516, titleKorean: '(자막) 장송의 프리렌' }], link });
    assert.equal((await h.record())?.status, 'saved');
    assert.equal(h.writes.filter((r) => r.path.endsWith('/progress')).length, 1);
  }
});

test('post-save local cleanup failure cannot retry an already successful progress write', async () => {
  const h = harness({ cleanupError: true });
  assert.equal((await h.record())?.status, 'saved');
  assert.equal(h.writes.length, 1);
});

test('SPA messages keep original sender URL but use current verified tab episode', async () => {
  for (const original of [url, 'https://laftel.net/']) {
    const h = harness();
    const next = 'https://laftel.net/player/41666/65124';
    h.state.episodeUrl = next; h.state.ep = 2;
    assert.equal((await h.record({ url: original, frameId: 0, tab: { id: 1, url: next } }))?.status, 'saved');
    assert.deepEqual(JSON.parse(h.writes[0].body), { progress: 2 });
  }
});
