const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('WATCHED 메시지를 pending으로 저장하고 팝업 실패 시 배지를 표시한다', async () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../background/service-worker.js'),
    'utf8'
  );
  let listener;
  let pending;
  const badge = [];
  const results = [{ id: 3, titleKorean: '장송의 프리렌' }];
  const context = {
    importScripts: () => {},
    searchAnime: async () => results,
    console: { warn: () => {} },
    chrome: {
      runtime: { onMessage: { addListener: (value) => { listener = value; } } },
      storage: { local: { set: async (value) => { pending = value; } } },
      action: {
        openPopup: async () => { throw new Error('gesture required'); },
        setBadgeText: (value) => badge.push(value),
        setBadgeBackgroundColor: (value) => badge.push(value),
      },
    },
  };
  vm.runInNewContext(source, context);

  listener({ type: 'WATCHED', payload: { animeName: '장송의 프리렌', ep: 11 } });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(JSON.parse(JSON.stringify(pending)), {
    pending: { animeName: '장송의 프리렌', ep: 11, results },
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(badge)), [
    { text: '●' },
    { color: '#e53e3e' },
  ]);
});

test('검색이 실패해도 빈 결과를 pending으로 저장하고 팝업 배지 fallback을 실행한다', async () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../background/service-worker.js'),
    'utf8'
  );
  let listener;
  let pending;
  let popupAttempts = 0;
  const badge = [];
  const context = {
    importScripts: () => {},
    searchAnime: async () => { throw new Error('temporary search outage'); },
    console: { warn: () => {} },
    chrome: {
      runtime: { onMessage: { addListener: (value) => { listener = value; } } },
      storage: { local: { set: async (value) => { pending = value; } } },
      action: {
        openPopup: async () => { popupAttempts += 1; throw new Error('gesture required'); },
        setBadgeText: (value) => badge.push(value),
        setBadgeBackgroundColor: (value) => badge.push(value),
      },
    },
  };
  vm.runInNewContext(source, context);

  listener({ type: 'WATCHED', payload: { animeName: '도굴왕', ep: 7 } });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(JSON.parse(JSON.stringify(pending)), {
    pending: { animeName: '도굴왕', ep: 7, results: [] },
  });
  assert.strictEqual(popupAttempts, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(badge)), [
    { text: '●' },
    { color: '#e53e3e' },
  ]);
});

test('자동 팝업은 감지된 탭의 windowId를 대상으로 연다', async () => {
  let listener;
  let popupOptions;
  const context = {
    importScripts: () => {},
    searchAnime: async () => [],
    chrome: {
      runtime: { onMessage: { addListener: (value) => { listener = value; } } },
      storage: { local: { set: async () => {} } },
      action: {
        openPopup: async (options) => { popupOptions = options; },
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {},
      },
    },
  };
  vm.runInNewContext(
    `${fs.readFileSync(path.join(__dirname, '../shared/api.js'), 'utf8')}\n${fs.readFileSync(
      path.join(__dirname, '../background/service-worker.js'),
      'utf8'
    )}`,
    context
  );

  listener(
    { type: 'WATCHED', payload: { animeName: '깨끗하게 해주시겠어요?', ep: 2 } },
    { tab: { url: 'https://www.netflix.com/watch/81713945', windowId: 42 } }
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(JSON.parse(JSON.stringify(popupOptions)), { windowId: 42 });
});

test('자동 팝업 실패 원인을 로그로 남기고 배지 fallback을 실행한다', async () => {
  let listener;
  const warnings = [];
  const badge = [];
  const context = {
    importScripts: () => {},
    searchAnime: async () => [],
    console: { warn: (...args) => warnings.push(args) },
    chrome: {
      runtime: { onMessage: { addListener: (value) => { listener = value; } } },
      storage: { local: { set: async () => {} } },
      action: {
        openPopup: async () => { throw new Error('popup blocked'); },
        setBadgeText: (value) => badge.push(value),
        setBadgeBackgroundColor: (value) => badge.push(value),
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../background/service-worker.js'), 'utf8'),
    context
  );

  listener(
    { type: 'WATCHED', payload: { animeName: '깨끗하게 해주시겠어요?', ep: 2 } },
    { tab: { windowId: 42 } }
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0][0], /자동 팝업 열기 실패/);
  assert.strictEqual(warnings[0][1].message, 'popup blocked');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(badge)), [
    { text: '●' },
    { color: '#e53e3e' },
  ]);
});

test('넷플릭스 탐색 페이지의 WATCHED 메시지는 무시한다', async () => {
  let listener;
  let searchAttempts = 0;
  let storageAttempts = 0;
  let popupAttempts = 0;
  const context = {
    importScripts: () => {},
    searchAnime: async () => { searchAttempts += 1; return []; },
    chrome: {
      runtime: { onMessage: { addListener: (value) => { listener = value; } } },
      storage: { local: { set: async () => { storageAttempts += 1; } } },
      action: {
        openPopup: async () => { popupAttempts += 1; },
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {},
      },
    },
  };
  vm.runInNewContext(
    `${fs.readFileSync(path.join(__dirname, '../shared/api.js'), 'utf8')}\n${fs.readFileSync(
      path.join(__dirname, '../background/service-worker.js'),
      'utf8'
    )}`,
    context
  );

  listener(
    { type: 'WATCHED', payload: { animeName: '홈 - 넷플릭스', ep: null } },
    { tab: { url: 'https://www.netflix.com/browse', windowId: 42 } }
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(searchAttempts, 0);
  assert.strictEqual(storageAttempts, 0);
  assert.strictEqual(popupAttempts, 0);
});

test('넷플릭스 서비스 전용 제목의 WATCHED 메시지는 무시한다', async () => {
  let listener;
  let searchAttempts = 0;
  let storageAttempts = 0;
  let popupAttempts = 0;
  const context = {
    importScripts: () => {},
    searchAnime: async () => { searchAttempts += 1; return []; },
    chrome: {
      runtime: { onMessage: { addListener: (value) => { listener = value; } } },
      storage: { local: { set: async () => { storageAttempts += 1; } } },
      action: {
        openPopup: async () => { popupAttempts += 1; },
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {},
      },
    },
  };
  vm.runInNewContext(
    `${fs.readFileSync(path.join(__dirname, '../shared/api.js'), 'utf8')}\n${fs.readFileSync(
      path.join(__dirname, '../background/service-worker.js'),
      'utf8'
    )}`,
    context
  );

  listener(
    { type: 'WATCHED', payload: { animeName: 'Netflix', ep: null } },
    { tab: { url: 'https://www.netflix.com/watch/81713945', windowId: 42 } }
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(searchAttempts, 0);
  assert.strictEqual(storageAttempts, 0);
  assert.strictEqual(popupAttempts, 0);
});

test('넷플릭스 빈 제목의 WATCHED 메시지는 무시한다', async () => {
  for (const payload of [
    { animeName: '   ', ep: null },
    { ep: null },
  ]) {
    let listener;
    let searchAttempts = 0;
    let storageAttempts = 0;
    let popupAttempts = 0;
    const context = {
      importScripts: () => {},
      searchAnime: async () => { searchAttempts += 1; return []; },
      chrome: {
        runtime: { onMessage: { addListener: (value) => { listener = value; } } },
        storage: { local: { set: async () => { storageAttempts += 1; } } },
        action: {
          openPopup: async () => { popupAttempts += 1; },
          setBadgeText: () => {},
          setBadgeBackgroundColor: () => {},
        },
      },
    };
    vm.runInNewContext(
      `${fs.readFileSync(path.join(__dirname, '../shared/api.js'), 'utf8')}\n${fs.readFileSync(
        path.join(__dirname, '../background/service-worker.js'),
        'utf8'
      )}`,
      context
    );

    listener(
      { type: 'WATCHED', payload },
      { tab: { url: 'https://www.netflix.com/watch/81713945', windowId: 42 } }
    );
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(searchAttempts, 0);
    assert.strictEqual(storageAttempts, 0);
    assert.strictEqual(popupAttempts, 0);
  }
});

test('넷플릭스 비문자열 제목의 WATCHED 메시지는 부작용 없이 무시한다', async () => {
  for (const animeName of [42, { title: '담배 고양이' }]) {
    let listener;
    let searchAttempts = 0;
    let storageAttempts = 0;
    let popupAttempts = 0;
    const context = {
      importScripts: () => {},
      searchAnime: async () => { searchAttempts += 1; return []; },
      chrome: {
        runtime: { onMessage: { addListener: (value) => { listener = value; } } },
        storage: { local: { set: async () => { storageAttempts += 1; } } },
        action: {
          openPopup: async () => { popupAttempts += 1; },
          setBadgeText: () => {},
          setBadgeBackgroundColor: () => {},
        },
      },
    };
    vm.runInNewContext(
      `${fs.readFileSync(path.join(__dirname, '../shared/api.js'), 'utf8')}\n${fs.readFileSync(
        path.join(__dirname, '../background/service-worker.js'),
        'utf8'
      )}`,
      context
    );

    listener(
      { type: 'WATCHED', payload: { animeName, ep: null } },
      { tab: { url: 'https://www.netflix.com/watch/81713945', windowId: 42 } }
    );
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(searchAttempts, 0);
    assert.strictEqual(storageAttempts, 0);
    assert.strictEqual(popupAttempts, 0);
  }
});

function laftelWorkerHarness({ status = 200 } = {}) {
  let listener;
  const pending = [];
  const paths = [];
  const context = {
    importScripts: () => {}, AbortSignal,
    fetch: async (url) => {
      paths.push(url);
      if (url.includes('/platform-links/')) return { ok: status === 200, status,
        json: async () => ({ id: 1516, titleKorean: '장송의 프리렌' }) };
      return { ok: true, json: async () => [{ id: 7, titleKorean: '검색 후보' }] };
    },
    chrome: {
      runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
      storage: { local: { set: async (value) => pending.push(value.pending) } },
      action: { openPopup: async () => {}, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shared/api.js'), 'utf8') + '\n'
    + fs.readFileSync(path.join(__dirname, '../background/service-worker.js'), 'utf8'), context);
  return {
    pending, paths,
    async watched(url, title = '(자막) 장송의 프리렌', ep = 1) {
      listener({ type: 'WATCHED', payload: { animeName: title, ep, platformAnimeId: 'forged' } },
        { tab: { url, windowId: 42 } });
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test('Laftel work ID takes priority over title and is reused for later episodes', async () => {
  const h = laftelWorkerHarness();
  await h.watched('https://laftel.net/player/41666/65123');
  await h.watched('https://laftel.net/player/41666/65124', '제목이 바뀌어도', 2);
  assert.strictEqual(h.pending.length, 2);
  for (const pending of h.pending) {
    assert.strictEqual(pending.results[0].id, 1516);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(pending.platformLink)), { platform: 'LAFTEL', platformAnimeId: '41666' });
    assert.strictEqual(pending.matchedByPlatform, true);
  }
  assert.strictEqual(h.pending[1].ep, 2);
  assert.strictEqual(h.paths.some((p) => p.includes('/search')), false);
});

test('unknown and unavailable Laftel mappings fall back to title search', async () => {
  for (const status of [404, 503]) {
    const h = laftelWorkerHarness({ status });
    await h.watched('https://laftel.net/player/41666/65123?test=1');
    assert.strictEqual(h.pending[0].results[0].id, 7);
    assert.strictEqual(h.pending[0].matchedByPlatform, false);
    assert.strictEqual(h.pending[0].platformLink.platformAnimeId, '41666');
    assert.strictEqual(h.paths.length, 2);
  }
});

test('Laftel non-player and malformed player pages do not create watched records', async () => {
  for (const url of ['https://laftel.net/item/41666', 'https://laftel.net/',
    'https://laftel.net/player/0/65123', 'https://laftel.net/player/41666/',
    'https://laftel.net/player/41666/65123/extra']) {
    const h = laftelWorkerHarness();
    await h.watched(url);
    assert.strictEqual(h.pending.length, 0, url);
    assert.strictEqual(h.paths.length, 0, url);
  }
});

test('lookalike hosts cannot create Laftel work-ID mappings', async () => {
  const h = laftelWorkerHarness();
  await h.watched('https://laftel.net.example.com/player/41666/65123');
  assert.strictEqual(h.pending[0]?.platformLink, undefined);
  assert.strictEqual(h.paths.some((p) => p.includes('/platform-links/')), false);
});
