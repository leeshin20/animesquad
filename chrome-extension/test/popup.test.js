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
    this.attributes = {};
    this.tabIndex = 0;
    this.focused = false;
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

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  focus() {
    this.focused = true;
  }

  appendChild(child) {
    this.children.push(child);
  }

  dispatch(type, event = {}) {
    return this.listeners[type](event);
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
    'btn-change-anime', 'record-status',
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
    stars,
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

test('기록 요청 중에는 진행 상태를 보이고 실패하면 화면 안에서 재시도 안내를 한다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const write = deferred();
  const apiFetch = async (requestPath, options = {}) => {
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: false, status: 404 };
    if (requestPath === '/api/watch' && options.method === 'POST') return write.promise;
    return { ok: true };
  };
  const harness = popupContext(apiFetch);

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  const recording = harness.elements['btn-record'].dispatch('click');

  assert.strictEqual(harness.elements['btn-record'].disabled, true);
  assert.strictEqual(harness.elements['btn-record'].textContent, '기록 중...');

  write.resolve({ ok: false, status: 500 });
  await recording;

  assert.strictEqual(harness.elements['btn-record'].disabled, false);
  assert.strictEqual(harness.elements['btn-record'].textContent, '기록하기');
  assert.strictEqual(harness.elements['record-status'].textContent, '기록 실패 (API 500). 다시 시도해주세요.');
  assert.strictEqual(harness.elements['record-status'].classNames.has('hidden'), false);
  assert.deepStrictEqual(harness.alerts, []);
});

function deferred() {
  let resolve;
  const promise = new Promise((value) => { resolve = value; });
  return { promise, resolve };
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

test('자동 매칭 후 다른 작품 선택을 열면 원문을 채우되 선택 전에는 별칭을 학습하지 않는다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const calls = [];
  const apiFetch = async (requestPath, options = {}) => {
    calls.push([requestPath, options]);
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: true };
    return { ok: true };
  };
  const harness = popupContext(apiFetch, {
    pending: {
      animeName: '(자막) 도굴왕',
      ep: 11,
      results: [{ id: 3, titleKorean: '도굴왕' }],
    },
    searchResults: [{ id: 4, titleKorean: '다른 도굴왕' }],
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  await harness.elements['btn-change-anime'].dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(harness.elements['search-section'].classNames.has('hidden'), false);
  assert.strictEqual(harness.elements['search-input'].value, '(자막) 도굴왕');

  await harness.elements['btn-record'].dispatch('click');
  assert.strictEqual(calls.some(([requestPath]) => requestPath.endsWith('/aliases')), false);
});

test('자동 매칭 후 다른 작품을 직접 선택하면 감지 원문을 별칭으로 학습한다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const calls = [];
  const apiFetch = async (requestPath, options = {}) => {
    calls.push([requestPath, options]);
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath.startsWith('/api/watch/') && !options.method) return { ok: true };
    return { ok: true };
  };
  const harness = popupContext(apiFetch, {
    pending: {
      animeName: '(자막) 도굴왕',
      ep: 11,
      results: [{ id: 3, titleKorean: '도굴왕' }],
    },
    searchResults: [{ id: 4, titleKorean: '도굴왕 리메이크' }],
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  await harness.elements['btn-change-anime'].dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  await harness.elements['search-results'].children[0].dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  await harness.elements['btn-record'].dispatch('click');

  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.slice(-2))), [
    ['/api/watch/4', { method: 'PATCH', body: { progress: 11 } }],
    ['/api/anime/4/aliases', { method: 'POST', body: { alias: '(자막) 도굴왕' } }],
  ]);
});

test('워치리스트 추가 후 기록 실패를 재시도해도 작품을 다시 추가하지 않는다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const calls = [];
  let patchAttempts = 0;
  const apiFetch = async (requestPath, options = {}) => {
    calls.push([requestPath, options]);
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: false, status: 404 };
    if (options.method === 'PATCH') {
      patchAttempts += 1;
      return patchAttempts === 1 ? { ok: false, status: 500 } : { ok: true };
    }
    return { ok: true };
  };
  const harness = popupContext(apiFetch);

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  await harness.elements['btn-record'].dispatch('click');
  await harness.elements['btn-record'].dispatch('click');

  assert.strictEqual(calls.filter(([requestPath, options]) =>
    requestPath === '/api/watch' && options.method === 'POST').length, 1);
  assert.strictEqual(calls.filter(([, options]) => options.method === 'PATCH').length, 2);
});

test('늦게 끝난 이전 작품 확인이 새 선택의 워치리스트 상태를 덮어쓰지 않는다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const oldCheck = deferred();
  const newCheck = deferred();
  const calls = [];
  const apiFetch = async (requestPath, options = {}) => {
    calls.push([requestPath, options]);
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return oldCheck.promise;
    if (requestPath === '/api/watch/4' && !options.method) return newCheck.promise;
    return { ok: true };
  };
  const harness = popupContext(apiFetch, {
    pending: { animeName: '도굴왕', ep: 11, results: [] },
    searchResults: [
      { id: 3, titleKorean: '이전 선택' },
      { id: 4, titleKorean: '최신 선택' },
    ],
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  harness.elements['search-input'].dispatch('input');
  await new Promise((resolve) => setImmediate(resolve));
  harness.elements['search-results'].children[0].dispatch('click');
  harness.elements['search-results'].children[1].dispatch('click');

  newCheck.resolve({ ok: true });
  await new Promise((resolve) => setImmediate(resolve));
  oldCheck.resolve({ ok: false, status: 404 });
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(harness.elements['watchlist-warning'].classNames.has('hidden'), true);
  await harness.elements['btn-record'].dispatch('click');
  assert.strictEqual(calls.some(([requestPath, options]) =>
    requestPath === '/api/watch' && options.method === 'POST'), false);
  assert.strictEqual(calls.some(([requestPath, options]) =>
    requestPath === '/api/watch/4' && options.method === 'PATCH'), true);
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

test('별칭 요청이 네트워크 오류를 던져도 pending을 지우고 완료 화면을 표시한다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const apiFetch = async (requestPath, options = {}) => {
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: true };
    if (requestPath.endsWith('/aliases')) throw new Error('network down');
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

test('무시는 수동 선택 후에도 별칭 API를 호출하지 않는다', async () => {
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
  await harness.elements['btn-dismiss'].dispatch('click');

  assert.strictEqual(calls.some(([requestPath]) => requestPath.endsWith('/aliases')), false);
  assert.strictEqual(harness.removedKey, 'pending');
});

test('감지된 화수와 평점·한줄평을 회차 PUT 요청에 전달한다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const calls = [];
  const apiFetch = async (requestPath, options = {}) => {
    calls.push([requestPath, options]);
    if (requestPath === '/api/me') return { ok: true };
    if (requestPath === '/api/watch/3' && !options.method) return { ok: true };
    return { ok: true };
  };
  const harness = popupContext(apiFetch, {
    pending: {
      animeName: '장송의 프리렌',
      ep: 11,
      results: [{ id: 3, titleKorean: '장송의 프리렌' }],
    },
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  harness.stars[3].dispatch('click');
  harness.elements['comment-input'].value = '좋았어요';
  await harness.elements['btn-record'].dispatch('click');

  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.at(-1))), [
    '/api/watch/3/episodes/11',
    { method: 'PUT', body: { score: 4, comment: '좋았어요' } },
  ]);
});

test('별점 클릭은 활성 별과 접근 가능한 현재 값을 함께 갱신한다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const harness = popupContext(async (requestPath) => {
    if (requestPath === '/api/me') return { ok: true };
    return { ok: true };
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  harness.stars[2].dispatch('click');

  assert.deepStrictEqual(harness.stars.map((star) => star.classNames.has('active')),
    [true, true, true, false, false]);
  assert.deepStrictEqual(harness.stars.map((star) => star.attributes['aria-checked']),
    ['false', 'false', 'true', 'false', 'false']);
  assert.deepStrictEqual(harness.stars.map((star) => star.tabIndex), [-1, -1, 0, -1, -1]);
});

test('별점 방향키는 좌·상으로 이전, 우·하로 다음 값을 선택한다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const cases = [
    ['ArrowLeft', 2, 1],
    ['ArrowUp', 2, 1],
    ['ArrowRight', 2, 3],
    ['ArrowDown', 2, 3],
  ];

  for (const [key, start, expected] of cases) {
    const harness = popupContext(async (requestPath) => {
      if (requestPath === '/api/me') return { ok: true };
      return { ok: true };
    });
    let prevented = false;

    vm.runInNewContext(source, harness.context);
    await new Promise((resolve) => setImmediate(resolve));
    harness.stars[start - 1].dispatch('click');
    harness.stars[start - 1].dispatch('keydown', {
      key,
      preventDefault: () => { prevented = true; },
    });

    assert.strictEqual(prevented, true, key);
    assert.strictEqual(harness.stars[expected - 1].attributes['aria-checked'], 'true', key);
    assert.strictEqual(harness.stars[expected - 1].focused, true, key);
  }
});

test('별점 방향키는 첫 값과 끝 값 사이를 순환한다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const cases = [
    ['ArrowLeft', 1, 5],
    ['ArrowUp', 1, 5],
    ['ArrowRight', 5, 1],
    ['ArrowDown', 5, 1],
  ];

  for (const [key, start, expected] of cases) {
    const harness = popupContext(async (requestPath) => {
      if (requestPath === '/api/me') return { ok: true };
      return { ok: true };
    });

    vm.runInNewContext(source, harness.context);
    await new Promise((resolve) => setImmediate(resolve));
    harness.stars[start - 1].dispatch('click');
    harness.stars[start - 1].dispatch('keydown', { key, preventDefault: () => {} });

    assert.strictEqual(harness.stars[expected - 1].attributes['aria-checked'], 'true', key);
    assert.strictEqual(harness.stars[expected - 1].focused, true, key);
  }
});

test('검색 결과는 포커스 가능한 option이고 클릭 선택 상태를 노출한다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
  const harness = popupContext(async (requestPath) => {
    if (requestPath === '/api/me') return { ok: true };
    return { ok: true };
  }, {
    pending: { animeName: '도굴왕', ep: 11, results: [] },
    searchResults: [
      { id: 3, titleKorean: '도굴왕' },
      { id: 4, titleKorean: '다른 도굴왕' },
    ],
  });

  vm.runInNewContext(source, harness.context);
  await new Promise((resolve) => setImmediate(resolve));
  harness.elements['search-input'].dispatch('input');
  await new Promise((resolve) => setImmediate(resolve));
  const [first, second] = harness.elements['search-results'].children;

  assert.deepStrictEqual([first.attributes.role, second.attributes.role], ['option', 'option']);
  assert.deepStrictEqual([first.tabIndex, second.tabIndex], [0, 0]);
  assert.deepStrictEqual([first.attributes['aria-selected'], second.attributes['aria-selected']], ['false', 'false']);

  await first.dispatch('click');
  assert.deepStrictEqual([first.attributes['aria-selected'], second.attributes['aria-selected']], ['true', 'false']);
});

test('검색 결과는 Enter와 Space로 선택하고 기본 동작을 막는다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');

  for (const key of ['Enter', ' ']) {
    const harness = popupContext(async (requestPath) => {
      if (requestPath === '/api/me') return { ok: true };
      return { ok: true };
    }, {
      pending: { animeName: '도굴왕', ep: 11, results: [] },
      searchResults: [{ id: 3, titleKorean: '도굴왕' }],
    });
    let prevented = false;

    vm.runInNewContext(source, harness.context);
    await new Promise((resolve) => setImmediate(resolve));
    harness.elements['search-input'].dispatch('input');
    await new Promise((resolve) => setImmediate(resolve));
    const option = harness.elements['search-results'].children[0];
    await option.dispatch('keydown', {
      key,
      preventDefault: () => { prevented = true; },
    });

    assert.strictEqual(prevented, true, key);
    assert.strictEqual(option.attributes['aria-selected'], 'true', key);
    assert.match(harness.elements['anime-label'].textContent, /도굴왕/, key);
  }
});
