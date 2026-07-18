const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('팝업은 네 가지 화면과 기록 입력 요소를 제공한다', () => {
  const html = fs.readFileSync(path.join(__dirname, '../popup/index.html'), 'utf8');

  for (const id of ['view-login', 'view-empty', 'view-record', 'view-done']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const id of [
    'search-input', 'ep-input', 'comment-input', 'btn-change-anime', 'btn-record', 'btn-dismiss',
  ]) {
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

test('팝업은 브랜드 락업과 접근 가능한 기록 입력을 제공한다', () => {
  const html = fs.readFileSync(path.join(__dirname, '../popup/index.html'), 'utf8');

  assert.match(html, /src="\.\.\/assets\/logo-mark\.svg"/);
  assert.match(html, /class="brand-lockup"/);
  assert.match(html, /<textarea[^>]*id="comment-input"[^>]*maxlength="280"/);
  assert.match(html, /<label[^>]*for="ep-input"/);
  assert.match(html, /role="radiogroup"[^>]*aria-label="평점"/);
  assert.doesNotMatch(html, /<ul[^>]*id="search-results"[^>]*role="listbox"/);
  assert.strictEqual((html.match(/<button[^>]*class="star"/g) || []).length, 5);
  assert.match(html, /role="status"/);
});

test('팝업 스타일은 승인된 크기와 브랜드 역할을 사용한다', () => {
  const css = fs.readFileSync(path.join(__dirname, '../popup/popup.css'), 'utf8');

  assert.match(css, /--brand-bright:\s*#22C55E/);
  assert.match(css, /--brand-strong:\s*#15803D/);
  assert.match(css, /--brand-soft:\s*#DCFCE7/);
  assert.match(css, /width:\s*320px/);
  assert.match(css, /padding:\s*18px/);
  assert.match(css, /#comment-input[\s\S]*height:\s*72px/);
  assert.match(css, /resize:\s*none/);
  assert.match(css, /focus-visible[\s\S]*--brand-strong/);
  assert.match(css, /\.star\s*{[^}]*min-height:\s*0[^}]*height:\s*\d+px/s);
  assert.match(css, /\.result-button\s*{[^}]*background:\s*transparent[^}]*color:\s*var\(--neutral-600\)/s);
  assert.match(css, /\.result-button:focus-visible\s*{[^}]*--brand-strong/s);
});

test('빈 상태 안내는 엔딩 감지 기준을 설명한다', () => {
  const html = fs.readFileSync(path.join(__dirname, '../popup/index.html'), 'utf8');

  assert.match(html, /엔딩 구간에 도달하면/);
  assert.doesNotMatch(html, /10분 이상/);
});
