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

function popupContext(apiFetch) {
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
  let removedKey;

  return {
    elements,
    get removedKey() { return removedKey; },
    context: {
      apiFetch,
      searchAnime: async () => [],
      WEB_BASE: 'https://animesquad.me',
      document: {
        getElementById: (id) => elements[id],
        querySelectorAll: (selector) => selector === '.star' ? stars : [],
        createElement: () => new FakeElement(),
      },
      chrome: {
        storage: {
          local: {
            get: async () => ({
              pending: {
                animeName: '장송의 프리렌',
                ep: 11,
                results: [{ id: 3, titleKorean: '장송의 프리렌' }],
              },
            }),
            remove: async (key) => { removedKey = key; },
          },
        },
        action: { setBadgeText: () => {} },
        tabs: { create: () => {} },
      },
      window: { close: () => {} },
      alert: () => {},
      setTimeout: (callback) => { callback(); },
      clearTimeout: () => {},
    },
  };
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
  assert.strictEqual(harness.removedKey, 'pending');
  assert.strictEqual(harness.elements['view-done'].classNames.has('hidden'), false);
});
