const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('팝업은 네 가지 화면과 기록 입력 요소를 제공한다', () => {
  const html = fs.readFileSync(path.join(__dirname, '../popup/index.html'), 'utf8');

  for (const id of ['view-login', 'view-empty', 'view-record', 'view-done']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const id of ['search-input', 'ep-input', 'comment-input', 'btn-record', 'btn-dismiss']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /src="\.\.\/shared\/api\.js"/);
  assert.match(html, /src="popup\.js"/);
});

test('팝업은 전용 스타일시트를 연결한다', () => {
  const html = fs.readFileSync(path.join(__dirname, '../popup/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../popup/popup.css'), 'utf8');

  assert.match(html, /href="popup\.css"/);
  assert.match(css, /\.hidden\s*{\s*display:\s*none\s*!important;/);
});
