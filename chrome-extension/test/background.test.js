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
    fs.readFileSync(path.join(__dirname, '../background/service-worker.js'), 'utf8'),
    context
  );

  listener(
    { type: 'WATCHED', payload: { animeName: '깨끗하게 해주시겠어요?', ep: 2 } },
    { tab: { windowId: 42 } }
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
