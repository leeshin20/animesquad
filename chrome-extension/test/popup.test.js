const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeElement {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.dataset = {};
    this.children = [];
    this.listeners = {};
    this.classNames = new Set(['hidden']);
    this.classList = {
      add: (name) => this.classNames.add(name),
      remove: (name) => this.classNames.delete(name),
      toggle: (name, force) => {
        const active = force ?? !this.classNames.has(name);
        active ? this.classNames.add(name) : this.classNames.delete(name);
      },
    };
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  appendChild(child) {
    this.children.push(child);
  }

  dispatch(type) {
    return this.listeners[type]();
  }

  set innerHTML(value) {
    if (value === '') this.children = [];
  }
}

function popupContext(apiFetch, {
  pending = {
    animeName: '장송의 프리렌',
    ep: 11,
    results: [{ id: 3, titleKorean: '장송의 프리렌' }],
  },
  searchResults = [],
} = {}) {
  const ids = [
    'view-login', 'view-empty', 'view-record', 'view-done', 'anime-label',
    'watchlist-warning', 'search-section', 'search-input', 'search-results',
    'ep-input', 'comment-input', 'btn-login', 'btn-dismiss', 'btn-record',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  const stars = Array.from({ length: 5 }, (_, index) => {
    const star = new FakeElement();
    star.dataset.v = String(index + 1);
    return star;
  });
  const alerts = [];
  let removedKey;

  return {
    alerts,
    elements,
    get removedKey() { return removedKey; },
    context: {
      apiFetch,
      searchAnime: async () => searchResults,
      WEB_BASE: 'https://animesquad.me',
      document: {
        getElementById: (id) => elements[id],
        querySelectorAll: (selector) => selector === '.star' ? stars : [],
        createElement: () => new FakeElement(),
      },
      chrome: {
        storage: {
          local: {
            get: async () => ({ pending }),
            remove: async (key) => { removedKey = key; },
          },
        },
        action: { setBadgeText: () => {} },
        tabs: { create: () => {} },
      },
      window: { close: () => {} },
      alert: (message) => alerts.push(message),
      setTimeout: (callback) => { callback(); },
      clearTimeout: () => {},
    },
  };
}

async function selectManualSearchResult(harness) {
  harness.elements['search-input'].value = '도굴왕';
  harness.elements['search-input'].dispatch('input');
  await new Promise((resolve) => setImmediate(resolve));
  await harness.elements['search-results'].children[0].dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
}

test('미등록 애니는 워치리스트에 추가하고 평점이 없으면 진도만 기록한다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const calls = [];
  const apiFetch = async (requestPath, options = {}) => {
    calls.push([requestPath, options]);
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: false, status: 404 };
    return { ok: true };
  };
  const harness = popupContext(apiFetch);

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  await harness.elements['btn-record'].dispatch('click');

  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.slice(2))), [
    ['/api/watch', { method: 'POST', body: { animeId: 3, status: 'WATCHING' } }],
    ['/api/watch/3', { method: 'PATCH', body: { progress: 11 } }],
  ]);
  assert.strictEqual(calls.some(([requestPath]) => requestPath.endsWith('/aliases')), false);
  assert.strictEqual(harness.removedKey, 'pending');
  assert.strictEqual(harness.elements['view-done'].classNames.has('hidden'), false);
});

test('수동 매칭 기록 성공 후 감지 원문을 별칭으로 학습한다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const calls = [];
  const apiFetch = async (requestPath, options = {}) => {
    calls.push([requestPath, options]);
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: true };
    return { ok: true };
  };
  const harness = popupContext(apiFetch, {
    pending: { animeName: '(자막) 도굴왕', ep: 11, results: [] },
    searchResults: [{ id: 3, titleKorean: '도굴왕' }],
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  await selectManualSearchResult(harness);
  await harness.elements['btn-record'].dispatch('click');

  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.slice(-2))), [
    ['/api/watch/3', { method: 'PATCH', body: { progress: 11 } }],
    ['/api/anime/3/aliases', { method: 'POST', body: { alias: '(자막) 도굴왕' } }],
  ]);
});

test('감상 기록 실패 시 별칭을 학습하지 않는다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const calls = [];
  const apiFetch = async (requestPath, options = {}) => {
    calls.push([requestPath, options]);
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: true };
    if (options.method === 'PATCH') return { ok: false, status: 500 };
    return { ok: true };
  };
  const harness = popupContext(apiFetch, {
    pending: { animeName: '(자막) 도굴왕', ep: 11, results: [] },
    searchResults: [{ id: 3, titleKorean: '도굴왕' }],
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  await selectManualSearchResult(harness);
  await harness.elements['btn-record'].dispatch('click');

  assert.strictEqual(calls.some(([requestPath]) => requestPath.endsWith('/aliases')), false);
  assert.strictEqual(harness.removedKey, undefined);
});

test('별칭 저장 실패는 성공한 감상 기록을 되돌리지 않는다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const apiFetch = async (requestPath, options = {}) => {
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: true };
    if (requestPath.endsWith('/aliases')) return { ok: false, status: 500 };
    return { ok: true };
  };
  const harness = popupContext(apiFetch, {
    pending: { animeName: '(자막) 도굴왕', ep: 11, results: [] },
    searchResults: [{ id: 3, titleKorean: '도굴왕' }],
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  await selectManualSearchResult(harness);
  await harness.elements['btn-record'].dispatch('click');

  assert.strictEqual(harness.removedKey, 'pending');
  assert.strictEqual(harness.elements['view-done'].classNames.has('hidden'), false);
  assert.deepStrictEqual(harness.alerts, ['기록은 완료됐지만 별칭 저장에 실패했어요.']);
});
