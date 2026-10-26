const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const url = 'https://laftel.net/player/41666/65123';
const frame = 'chrome-extension://test/popup/index.html?embedded=1';

function harness({ ready = true, mounted = true } = {}) {
  let listener;
  const states = new Map([[1, { episodeUrl: url, animeName: '(자막) 장송의 프리렌', ep: 1, readyToRecord: ready, inlineAvailable: mounted }]]);
  const messages = [];
  const queries = [];
  let pending = { episodeUrl: 'https://laftel.net/player/1/2', animeName: '다른 작품', ep: 9 };
  let popups = 0;
  const context = {
    importScripts() {},
    findPlatformAnime: async (source) => { queries.push(source); return { id: 1516, titleKorean: '장송의 프리렌' }; },
    searchAnime: async () => [],
    asqIsInvalidNetflixTitle: (title) => !title,
    chrome: {
      runtime: { getURL: (p) => `chrome-extension://test/${p}`, onMessage: { addListener: (fn) => { listener = fn; } } },
      tabs: { sendMessage: async (id, message) => {
        if (message.type === 'GET_INLINE_STATE') return states.get(id);
        messages.push({ id, ...message });
      } },
      storage: { local: {
        get: async () => ({ pending }), set: async (value) => { pending = value.pending; },
        remove: async () => { pending = null; },
      } },
      action: { openPopup: async () => { popups++; }, setBadgeText() {}, setBadgeBackgroundColor() {} },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../background/service-worker.js'), 'utf8'), context);
  return {
    states, messages, queries,
    get pending() { return pending; }, get popups() { return popups; },
    async request(type, payload = {}, sender = { url: frame, tab: { id: 1, url } }) {
      let result;
      listener({ type, ...payload }, sender, (value) => { result = value; });
      await new Promise((resolve) => setImmediate(resolve));
      return result && JSON.parse(JSON.stringify(result));
    },
  };
}

test('inline context uses containing tab identity and ignores global pending/forged ID', async () => {
  const h = harness();
  const result = await h.request('LAFTEL_INLINE_CONTEXT', { platformAnimeId: 'forged' });
  assert.equal(result?.pending.results[0].id, 1516);
  assert.equal(result.pending.platformLink.platformAnimeId, '41666');
  assert.equal(result.pending.ep, 1);
  assert.equal(result.episodeUrl, url);
  assert.equal(result.current.platform, '라프텔');
});

test('before ending inline context shows current info but exposes no recording form', async () => {
  const h = harness({ ready: false });
  const result = await h.request('LAFTEL_INLINE_CONTEXT');
  assert.equal(result?.pending, null);
  assert.equal(result.current.ep, 1);
  assert.equal(h.queries.length, 0);
});

test('page scripts, other extension pages and non-player tabs cannot use inline commands', async () => {
  const h = harness();
  for (const sender of [
    { url, tab: { id: 1, url } },
    { url: 'chrome-extension://other/popup/index.html?embedded=1', tab: { id: 1, url } },
    { url: 'chrome-extension://test/popup/index.html', tab: { id: 1, url } },
    { url: frame, tab: { id: 1, url: 'https://laftel.net/item/41666' } },
  ]) {
    const result = await h.request('LAFTEL_INLINE_CONTEXT', {}, sender);
    assert.equal(result?.pending, undefined);
  }
  assert.equal(h.queries.length, 0);
});

test('validation rejects stale episode or an episode that has not reached ending', async () => {
  const h = harness();
  assert.equal((await h.request('LAFTEL_INLINE_VALIDATE', { episodeUrl: url }))?.ok, true);
  assert.equal((await h.request('LAFTEL_INLINE_VALIDATE', { episodeUrl: url + '4' }))?.ok, false);
  h.states.get(1).readyToRecord = false;
  assert.equal((await h.request('LAFTEL_INLINE_VALIDATE', { episodeUrl: url }))?.ok, false);
});

test('completion only updates matching tab and preserves another episode pending', async () => {
  const h = harness();
  assert.equal((await h.request('LAFTEL_INLINE_SAVED', { episodeUrl: url }))?.ok, true);
  assert.equal(h.messages[0]?.type, 'LAFTEL_INLINE_SAVED');
  assert.equal(h.messages[0].id, 1);
  assert.equal(h.pending.ep, 9);
  const count = h.messages.length;
  await h.request('LAFTEL_INLINE_SAVED', { episodeUrl: url + '4' });
  assert.equal(h.messages.length, count);
});

test('mounted inline controls suppress automatic toolbar popup; missing controls keep fallback', async () => {
  for (const mounted of [true, false]) {
    const h = harness({ mounted });
    await h.request('WATCHED', { payload: { animeName: '(자막) 장송의 프리렌', ep: 1 } }, { url, tab: { id: 1, url } });
    assert.equal(h.popups, mounted ? 0 : 1);
    assert.equal(h.pending.episodeUrl, url);
  }
});
