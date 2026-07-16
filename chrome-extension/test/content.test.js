const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('10분 체류 후 페이지를 벗어나면 WATCHED 메시지를 보낸다', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../content/index.js'),
    'utf8'
  );
  const messages = [];
  const listeners = {};
  let now = 0;

  vm.runInNewContext(source, {
    Date: { now: () => now },
    location: { href: 'https://laftel.net/item/1', hostname: 'laftel.net' },
    document: { title: '장송의 프리렌 11화 - 라프텔', querySelector: () => ({}), head: {} },
    MutationObserver: class {
      observe() {}
    },
    asqParseTitle: () => ({ animeName: '장송의 프리렌', ep: 11 }),
    setInterval: () => {},
    window: { addEventListener: (type, listener) => { listeners[type] = listener; } },
    chrome: { runtime: { sendMessage: (message) => messages.push(message) } },
  });

  now = 600_000;
  listeners.pagehide();

  assert.deepStrictEqual(JSON.parse(JSON.stringify(messages)), [
    { type: 'WATCHED', payload: { animeName: '장송의 프리렌', ep: 11 } },
  ]);
});
