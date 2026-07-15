# Chrome Extension — 스트리밍 사이트 애니 자동 감지 및 기록 Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 넷플릭스, 라프텔, 크런치롤에서 애니 시청 후 페이지를 벗어날 때 animesquad에 회차 기록을 남길 수 있도록 안내하는 Chrome 확장프로그램을 구현한다.

**Architecture:** Chrome Extension (Manifest V3) — Content Script(제목 파싱/시청 감지), Service Worker(감지 이벤트 수신 → 애니 검색 → pending 저장 + 배지), Popup(기록 폼). 인증은 **웹 세션 쿠키 재사용**: 프로덕션 쿠키가 `ASQ_SESSION; Domain=.animesquad.me`라서 익스텐션이 `host_permissions`에 `https://api.animesquad.me/*`를 갖고 `credentials: 'include'`로 요청하면 웹 로그인 세션을 그대로 쓴다(JWT TTL 30일). **백엔드 변경 없음.**

**Tech Stack:** Vanilla JS (Chrome Extension MV3), chrome.storage.local, node:test (파서 단위 테스트)

---

## 2026-06-29 계획 대비 변경 사항

이 계획은 `docs/superpowers/specs/2026-06-29-chrome-extension-design.md`와 `docs/superpowers/plans/2026-06-29-chrome-extension.md`를 현재 코드베이스(2026-07-16) 기준으로 재검증해 다시 쓴 것이다.

| 항목 | 6/29 계획 | 현재 계획 | 이유 |
|------|-----------|-----------|------|
| 인증 | 익스텐션 내 Google OAuth + `POST /api/auth/google` 신규 엔드포인트 + Bearer 헤더 | 웹 세션 쿠키(`ASQ_SESSION`) 재사용, 미로그인 시 animesquad.me 로그인 유도 | 현재 `JwtAuthenticationFilter`는 쿠키만 읽음. 또한 가입이 초대제로 바뀌어(`OAuth2LoginSuccessHandler`) `upsertFromGoogle` 자동 가입은 초대제 우회가 됨. 쿠키 재사용이면 백엔드 변경 0 |
| 백엔드 작업 | Task 1–2 (verifier, controller, SecurityConfig) | **없음** | 위와 동일 |
| 워치리스트 추가 | `POST /api/watch` body `{animeId}` | `{animeId, status: "WATCHING"}` | `AddWatchRequest.status`가 `@NotNull` |
| 회차 기록 필드 | `{rating, comment}` | `{score, comment}` | `RateEpisodeRequest`는 `score`(1–5), `comment`(≤280자) |
| 평점·한줄평 둘 다 비었을 때 | 그대로 PUT | `PATCH /api/watch/{animeId}` `{progress: ep}` 로 분기 | `RateEpisodeRequest`는 score/comment 둘 다 비면 400. 웹 `EpisodeLogModal.tsx:66-73`과 동일한 분기 |
| 검색 인증 | JWT 필요 가정 | 불필요 (참고) | `SecurityConfig`에서 `GET /api/anime/**`는 `permitAll` |
| SPA URL 변경 감지 | `history.pushState` 후킹 | `setInterval`로 `location.href` 폴링 + `pagehide` | Content script는 isolated world라 페이지(main world)의 `pushState` 호출을 후킹으로 잡을 수 없음 |
| 파서 테스트 | 없음 (수동만) | `node --test` 단위 테스트 | 파서가 가장 깨지기 쉬운 부분 — 순수 함수로 분리해 TDD |

**검증된 현재 API (모두 기존 그대로 사용):**
- `GET /api/me` — 로그인 확인 (401이면 미로그인)
- `GET /api/anime/search?q={query}` — 애니 검색, 인증 불필요, 최대 20건, `AnimeResponse[]` (`id`, `titleKorean`, `titleRomaji`, …)
- `GET /api/watch/{animeId}` — 워치리스트 확인 (404면 미등록)
- `POST /api/watch` — `{animeId, status}` → 201
- `PUT /api/watch/{animeId}/episodes/{ep}` — `{score, comment}` upsert. 서버가 progress도 함께 올림 (`EpisodeRatingService`). 워치리스트 미등록이면 404
- `PATCH /api/watch/{animeId}` — `{progress}` (평점·한줄평 없이 진도만 기록할 때)

---

## File Map (전부 신규, 백엔드 수정 없음)

```
chrome-extension/
  manifest.json                  # MV3 설정 (permissions: storage, host: api.animesquad.me)
  shared/api.js                  # API_BASE + apiFetch (popup·service worker 공용, credentials: include)
  content/parsers.js             # 사이트별 제목 파서 — 순수 함수, node 테스트 가능
  content/index.js               # 체류 시간 측정, URL 변경 폴링, pagehide → WATCHED 메시지
  background/service-worker.js   # WATCHED 수신 → 검색 → pending 저장 + 배지
  popup/index.html
  popup/popup.css
  popup/popup.js                 # 로그인 확인, 기록 폼, 검색, 별점
  icons/icon128.png              # placeholder
  test/parsers.test.js           # node --test 파서 단위 테스트
```

---

## Task 1: 프로젝트 셋업 (manifest + 아이콘)

**Files:**
- Create: `chrome-extension/manifest.json`
- Create: `chrome-extension/icons/icon128.png`

- [ ] **Step 1: 디렉토리 구조 생성**

```bash
mkdir -p /Users/yubeen/animesquad/chrome-extension/{shared,content,background,popup,icons,test}
```

- [ ] **Step 2: manifest.json 생성**

`identity` 권한, `oauth2` 블록 불필요 (쿠키 재사용 방식). 넷플릭스 등 스트리밍 사이트는 `content_scripts.matches`만으로 주입되므로 `host_permissions`는 API 도메인만 필요하다.

```json
{
  "manifest_version": 3,
  "name": "AnimeSquad",
  "version": "1.0.0",
  "description": "넷플릭스, 라프텔, 크런치롤에서 애니 시청 기록을 animesquad에 남기세요.",
  "permissions": ["storage"],
  "host_permissions": ["https://api.animesquad.me/*"],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://www.netflix.com/*",
        "https://laftel.net/*",
        "https://www.crunchyroll.com/*"
      ],
      "js": ["content/parsers.js", "content/index.js"]
    }
  ],
  "action": {
    "default_popup": "popup/index.html",
    "default_icon": { "128": "icons/icon128.png" }
  },
  "icons": { "128": "icons/icon128.png" }
}
```

- [ ] **Step 3: 아이콘 placeholder 생성**

```bash
python3 -c "
import struct, zlib
def make_png(w, h):
    def chunk(tag, data):
        c = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', c)
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    raw = b''.join(b'\x00' + b'\x3a\x2d\x6e' * w for _ in range(h))
    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    return b'\x89PNG\r\n\x1a\n' + ihdr + idat + iend
open('/Users/yubeen/animesquad/chrome-extension/icons/icon128.png', 'wb').write(make_png(128, 128))
"
```

- [ ] **Step 4: 커밋**

```bash
git add chrome-extension/
git commit -m "chore(extension): Chrome extension MV3 project setup"
```

---

## Task 2: 사이트별 제목 파서 (TDD)

**Files:**
- Create: `chrome-extension/content/parsers.js`
- Test: `chrome-extension/test/parsers.test.js`

파서는 DOM/chrome API를 전혀 참조하지 않는 순수 함수로 작성한다. Content script에서는 전역 `asqParseTitle`로, Node 테스트에서는 `module.exports`로 접근한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// chrome-extension/test/parsers.test.js
const test = require('node:test');
const assert = require('node:assert');
const { asqParseTitle } = require('../content/parsers.js');

test('크런치롤: 에피소드 있는 제목', () => {
  assert.deepStrictEqual(
    asqParseTitle('www.crunchyroll.com', "Frieren: Beyond Journey's End - Episode 11 - A Real Hero"),
    { animeName: "Frieren: Beyond Journey's End", ep: 11 }
  );
});

test('넷플릭스: 에피소드 있는 제목', () => {
  assert.deepStrictEqual(
    asqParseTitle('www.netflix.com', "Episode 11 | Frieren: Beyond Journey's End | Netflix"),
    { animeName: "Frieren: Beyond Journey's End", ep: 11 }
  );
});

test('넷플릭스: 에피소드 없는 제목', () => {
  assert.deepStrictEqual(
    asqParseTitle('www.netflix.com', "Frieren: Beyond Journey's End | Netflix"),
    { animeName: "Frieren: Beyond Journey's End", ep: null }
  );
});

test('라프텔: 화수 있는 제목', () => {
  assert.deepStrictEqual(
    asqParseTitle('laftel.net', '장송의 프리렌 11화 - 라프텔'),
    { animeName: '장송의 프리렌', ep: 11 }
  );
});

test('라프텔: 화수 없는 제목', () => {
  assert.deepStrictEqual(
    asqParseTitle('laftel.net', '장송의 프리렌 - 라프텔'),
    { animeName: '장송의 프리렌', ep: null }
  );
});

test('지원하지 않는 호스트는 null', () => {
  assert.strictEqual(asqParseTitle('www.youtube.com', '아무 제목'), null);
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/yubeen/animesquad && node --test chrome-extension/test/
```

Expected: FAIL — `Cannot find module '../content/parsers.js'`

- [ ] **Step 3: 파서 구현**

```js
// chrome-extension/content/parsers.js
// 순수 함수만 — DOM/chrome API 참조 금지 (node --test로 테스트됨)
const ASQ_PARSERS = [
  {
    host: 'crunchyroll.com',
    // "Frieren: Beyond Journey's End - Episode 11 - A Real Hero"
    parse(title) {
      const epMatch = title.match(/[-–]\s*Episode\s*(\d+)/i);
      const ep = epMatch ? parseInt(epMatch[1]) : null;
      const animeName = title.split(/[-–]\s*Episode/i)[0].trim();
      return animeName ? { animeName, ep } : null;
    },
  },
  {
    host: 'netflix.com',
    // "Episode 11 | Frieren: Beyond Journey's End | Netflix"
    // "Frieren: Beyond Journey's End | Netflix"
    parse(title) {
      const cleaned = title.replace(/\|\s*Netflix\s*$/i, '').trim();
      const epMatch = cleaned.match(/Episode\s*(\d+)/i);
      const ep = epMatch ? parseInt(epMatch[1]) : null;
      const animeName = cleaned
        .replace(/Episode\s*\d+\s*[|]?\s*/i, '')
        .replace(/\|\s*.*$/, '')
        .trim();
      return animeName ? { animeName, ep } : null;
    },
  },
  {
    host: 'laftel.net',
    // "장송의 프리렌 11화 - 라프텔"
    parse(title) {
      const cleaned = title.replace(/[-–]\s*라프텔\s*$/i, '').trim();
      const epMatch = cleaned.match(/(\d+)화/);
      const ep = epMatch ? parseInt(epMatch[1]) : null;
      const animeName = cleaned.replace(/\s*\d+화.*$/, '').trim();
      return animeName ? { animeName, ep } : null;
    },
  },
];

function asqParseTitle(hostname, title) {
  const parser = ASQ_PARSERS.find((p) => hostname.includes(p.host));
  return parser ? parser.parse(title) : null;
}

if (typeof module !== 'undefined') {
  module.exports = { asqParseTitle };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/yubeen/animesquad && node --test chrome-extension/test/
```

Expected: `pass 6, fail 0`

- [ ] **Step 5: 커밋**

```bash
git add chrome-extension/content/parsers.js chrome-extension/test/parsers.test.js
git commit -m "feat(extension): site-specific title parsers with node:test coverage"
```

---

## Task 3: Content Script — 시청 감지

**Files:**
- Create: `chrome-extension/content/index.js`

`parsers.js`가 manifest에서 먼저 로드되므로 `asqParseTitle` 전역을 그대로 쓴다. Content script는 isolated world에서 실행되어 페이지의 `history.pushState`를 후킹할 수 없으므로, URL 변경은 1초 간격 폴링으로 감지한다. 탭을 닫거나 사이트를 떠나는 경우는 `pagehide`로 잡는다.

- [ ] **Step 1: content/index.js 작성**

```js
// chrome-extension/content/index.js
const MIN_WATCH_SECONDS = 600; // 10분

let startTime = Date.now();
let lastUrl = location.href;
let lastParsed = asqParseTitle(location.hostname, document.title);

// 제목이 다른 애니로 바뀌면 재파싱 + 타이머 리셋
const titleObserver = new MutationObserver(() => {
  const parsed = asqParseTitle(location.hostname, document.title);
  if (parsed && parsed.animeName !== lastParsed?.animeName) {
    startTime = Date.now();
    lastParsed = parsed;
  }
});
titleObserver.observe(document.querySelector('title') ?? document.head, {
  subtree: true,
  childList: true,
  characterData: true,
});

function notifyIfWatched() {
  const elapsed = (Date.now() - startTime) / 1000;
  if (elapsed >= MIN_WATCH_SECONDS && lastParsed) {
    chrome.runtime.sendMessage({ type: 'WATCHED', payload: lastParsed });
  }
}

// SPA URL 변경 감지 — isolated world라 pushState 후킹이 불가능해 폴링 사용
setInterval(() => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  notifyIfWatched();
  startTime = Date.now();
  lastParsed = asqParseTitle(location.hostname, document.title);
}, 1000);

// 탭 닫기 / 사이트 이탈
window.addEventListener('pagehide', notifyIfWatched);
```

- [ ] **Step 2: 커밋**

```bash
git add chrome-extension/content/index.js
git commit -m "feat(extension): content script — watch detection via URL polling and pagehide"
```

---

## Task 4: 공용 API 헬퍼 + Service Worker

**Files:**
- Create: `chrome-extension/shared/api.js`
- Create: `chrome-extension/background/service-worker.js`

`shared/api.js`는 popup에서는 `<script>` 태그로, service worker에서는 `importScripts`로 로드하는 plain script다. 모든 요청에 `credentials: 'include'`를 붙여 `ASQ_SESSION` 쿠키를 태운다 (host_permissions 덕에 SameSite=Lax여도 첨부됨).

- [ ] **Step 1: shared/api.js 작성**

```js
// chrome-extension/shared/api.js
// popup(<script>)과 service worker(importScripts) 양쪽에서 로드되는 plain script
const API_BASE = 'https://api.animesquad.me';
const WEB_BASE = 'https://animesquad.me';

async function apiFetch(path, { method = 'GET', body } = {}) {
  return fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

async function searchAnime(query) {
  const res = await apiFetch(`/api/anime/search?q=${encodeURIComponent(query)}`);
  return res.ok ? res.json() : [];
}
```

- [ ] **Step 2: background/service-worker.js 작성**

Service Worker의 역할은 하나: `WATCHED` 메시지를 받아 애니를 검색하고 `pending`으로 저장한 뒤 사용자를 부른다. `chrome.action.openPopup()`은 user gesture 없이는 대부분 실패하므로 배지 fallback이 사실상의 기본 경로다.

```js
// chrome-extension/background/service-worker.js
importScripts('../shared/api.js');

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'WATCHED') return;
  (async () => {
    const { animeName, ep } = msg.payload;
    const results = await searchAnime(animeName);
    await chrome.storage.local.set({ pending: { animeName, ep, results } });
    try {
      await chrome.action.openPopup();
    } catch {
      chrome.action.setBadgeText({ text: '●' });
      chrome.action.setBadgeBackgroundColor({ color: '#e53e3e' });
    }
  })();
});
```

- [ ] **Step 3: 커밋**

```bash
git add chrome-extension/shared/api.js chrome-extension/background/service-worker.js
git commit -m "feat(extension): shared API helper and service worker (detect → search → pending)"
```

---

## Task 5: Popup — HTML + CSS

**Files:**
- Create: `chrome-extension/popup/index.html`
- Create: `chrome-extension/popup/popup.css`

뷰 4개: 로그인 유도(`view-login`), 대기 기록 없음(`view-empty`), 기록 폼(`view-record`), 완료(`view-done`). 화수 입력은 파싱 실패 대비로 항상 노출하고, 파싱되면 미리 채운다.

- [ ] **Step 1: popup/index.html 생성**

```html
<!-- chrome-extension/popup/index.html -->
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>AnimeSquad</title>
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <div id="app">
    <!-- 미로그인 -->
    <div id="view-login" class="view hidden">
      <h1>AnimeSquad</h1>
      <p class="hint">animesquad.me에 로그인하면 익스텐션이 자동으로 연결돼요.</p>
      <button id="btn-login">animesquad.me에서 로그인</button>
    </div>

    <!-- 대기 중인 기록 없음 -->
    <div id="view-empty" class="view hidden">
      <h1>AnimeSquad</h1>
      <p class="hint">감지된 시청 기록이 없어요. 넷플릭스, 라프텔, 크런치롤에서 애니를 10분 이상 보면 여기서 기록할 수 있어요.</p>
    </div>

    <!-- 기록 폼 -->
    <div id="view-record" class="view hidden">
      <h1>AnimeSquad</h1>
      <p id="anime-label"></p>
      <p id="watchlist-warning" class="warning hidden">⚠ 워치리스트에 없어요. 함께 추가돼요.</p>

      <!-- 매칭 실패 시에만 표시 -->
      <div id="search-section" class="hidden">
        <input id="search-input" type="text" placeholder="애니 검색..." />
        <ul id="search-results"></ul>
      </div>

      <label class="ep-row">화수 <input id="ep-input" type="number" min="1" /></label>

      <div class="rating-row">
        <span>평점</span>
        <div id="stars">
          <span class="star" data-v="1">★</span>
          <span class="star" data-v="2">★</span>
          <span class="star" data-v="3">★</span>
          <span class="star" data-v="4">★</span>
          <span class="star" data-v="5">★</span>
        </div>
      </div>

      <input id="comment-input" type="text" placeholder="한줄평 (선택)" maxlength="280" />

      <div class="btn-row">
        <button id="btn-record">기록하기</button>
        <button id="btn-dismiss" class="secondary">무시</button>
      </div>
    </div>

    <!-- 완료 -->
    <div id="view-done" class="view hidden">
      <p class="done-msg">기록 완료! ✓</p>
    </div>
  </div>
  <script src="../shared/api.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: popup/popup.css 생성**

```css
/* chrome-extension/popup/popup.css */
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  width: 300px;
  padding: 16px;
  background: #1a1a2e;
  color: #eee;
}

h1 { font-size: 18px; font-weight: 700; color: #e879f9; margin-bottom: 4px; }

.hidden { display: none !important; }

.view { display: flex; flex-direction: column; gap: 12px; }

.hint { font-size: 13px; line-height: 1.6; color: #aaa; }

button {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  background: #e879f9;
  color: #fff;
}

button.secondary { background: #333; color: #aaa; }

input[type="text"], input[type="number"] {
  width: 100%;
  padding: 8px;
  border: 1px solid #444;
  border-radius: 6px;
  background: #2a2a3e;
  color: #eee;
  font-size: 13px;
}

#anime-label { font-size: 14px; line-height: 1.5; }

.warning { font-size: 12px; color: #fbbf24; }

.ep-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.ep-row input { width: 70px; }

.rating-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
#stars { display: flex; gap: 4px; }
.star { font-size: 22px; color: #555; cursor: pointer; user-select: none; }
.star.active { color: #fbbf24; }

.btn-row { display: flex; gap: 8px; }
.btn-row button { flex: 1; }

ul { list-style: none; max-height: 120px; overflow-y: auto; border: 1px solid #444; border-radius: 6px; }
ul:empty { display: none; }
ul li { padding: 6px 10px; font-size: 13px; cursor: pointer; }
ul li:hover { background: #2a2a3e; }
ul li.selected { background: #3a1a4e; }

.done-msg { font-size: 18px; text-align: center; padding: 20px 0; color: #6ee7b7; }
```

- [ ] **Step 3: 커밋**

```bash
git add chrome-extension/popup/index.html chrome-extension/popup/popup.css
git commit -m "feat(extension): popup HTML and CSS"
```

---

## Task 6: Popup — 로직 (popup.js)

**Files:**
- Create: `chrome-extension/popup/popup.js`

기록 API 호출 순서 (웹 `EpisodeLogModal`과 동일한 분기):
1. 워치리스트 미등록이면 `POST /api/watch` `{animeId, status: 'WATCHING'}`
2. 평점 또는 한줄평이 있으면 `PUT /api/watch/{animeId}/episodes/{ep}` `{score, comment}` (progress는 서버가 올림)
3. 둘 다 없으면 `PATCH /api/watch/{animeId}` `{progress: ep}`

- [ ] **Step 1: popup.js 작성**

```js
// chrome-extension/popup/popup.js
let selectedAnime = null;   // AnimeResponse: { id, titleKorean, titleRomaji, ... }
let selectedRating = null;  // 1–5 | null
let inList = false;

const $ = (id) => document.getElementById(id);

function showView(id) {
  ['view-login', 'view-empty', 'view-record', 'view-done'].forEach((v) => {
    $(v).classList.toggle('hidden', v !== id);
  });
}

function displayTitle(anime) {
  return anime.titleKorean || anime.titleRomaji || anime.titleEnglish;
}

// ── 초기화 ────────────────────────────────────────────────
async function init() {
  let me;
  try {
    me = await apiFetch('/api/me');
  } catch {
    showView('view-login');
    return;
  }
  if (!me.ok) {
    showView('view-login');
    return;
  }

  const { pending } = await chrome.storage.local.get('pending');
  if (!pending) {
    showView('view-empty');
    return;
  }

  showView('view-record');
  loadRecord(pending);
}

async function loadRecord({ animeName, ep, results }) {
  if (ep) $('ep-input').value = ep;

  if (results && results.length > 0) {
    await selectAnime(results[0]);
  } else {
    $('anime-label').textContent = `"${animeName}" 을(를) 찾지 못했어요. 직접 검색해주세요.`;
    $('search-section').classList.remove('hidden');
    $('search-input').value = animeName;
  }
}

async function selectAnime(anime) {
  selectedAnime = anime;
  const ep = parseInt($('ep-input').value) || null;
  $('anime-label').textContent = `${displayTitle(anime)} ${ep ? ep + '화' : ''} 기록할까요?`;

  const check = await apiFetch(`/api/watch/${anime.id}`);
  inList = check.ok;
  $('watchlist-warning').classList.toggle('hidden', inList);
}

// ── 검색 (매칭 실패 시) ───────────────────────────────────
let debounceTimer;
$('search-input').addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const q = $('search-input').value.trim();
    if (!q) return;
    renderResults(await searchAnime(q));
  }, 300);
});

function renderResults(results) {
  const ul = $('search-results');
  ul.innerHTML = '';
  results.slice(0, 8).forEach((a) => {
    const li = document.createElement('li');
    li.textContent = displayTitle(a);
    li.addEventListener('click', () => {
      [...ul.children].forEach((el) => el.classList.remove('selected'));
      li.classList.add('selected');
      selectAnime(a);
    });
    ul.appendChild(li);
  });
}

// ── 별점 ──────────────────────────────────────────────────
document.querySelectorAll('.star').forEach((star) => {
  star.addEventListener('click', () => {
    selectedRating = parseInt(star.dataset.v);
    document.querySelectorAll('.star').forEach((s) => {
      s.classList.toggle('active', parseInt(s.dataset.v) <= selectedRating);
    });
  });
});

// ── 버튼 ──────────────────────────────────────────────────
$('btn-login').addEventListener('click', () => {
  chrome.tabs.create({ url: WEB_BASE });
  window.close();
});

$('btn-dismiss').addEventListener('click', async () => {
  await chrome.storage.local.remove('pending');
  chrome.action.setBadgeText({ text: '' });
  window.close();
});

$('btn-record').addEventListener('click', async () => {
  if (!selectedAnime) { alert('애니를 선택해주세요.'); return; }

  const ep = parseInt($('ep-input').value);
  if (!ep || ep < 1) { alert('화수를 입력해주세요.'); return; }

  const comment = $('comment-input').value.trim();

  try {
    if (!inList) {
      const res = await apiFetch('/api/watch', {
        method: 'POST',
        body: { animeId: selectedAnime.id, status: 'WATCHING' },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
    }

    if (selectedRating != null || comment) {
      const res = await apiFetch(`/api/watch/${selectedAnime.id}/episodes/${ep}`, {
        method: 'PUT',
        body: { score: selectedRating, comment: comment || null },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
    } else {
      const res = await apiFetch(`/api/watch/${selectedAnime.id}`, {
        method: 'PATCH',
        body: { progress: ep },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
    }

    await chrome.storage.local.remove('pending');
    chrome.action.setBadgeText({ text: '' });
    showView('view-done');
    setTimeout(() => window.close(), 1200);
  } catch (e) {
    alert('기록 실패: ' + e.message);
  }
});

init();
```

- [ ] **Step 2: 커밋**

```bash
git add chrome-extension/popup/popup.js
git commit -m "feat(extension): popup logic — session check, record form, search, star rating"
```

---

## Task 7: 로컬 수동 테스트

Chrome에서 `chrome://extensions` → "개발자 모드" 활성화 → "압축해제된 확장 프로그램 로드" → `chrome-extension/` 폴더 선택.

테스트 전 `content/index.js`의 `MIN_WATCH_SECONDS`를 임시로 `10`으로 바꾼다.

- [ ] **Step 1: 세션 연결 테스트**

animesquad.me에 로그인된 상태에서 익스텐션 아이콘 클릭 → "감지된 시청 기록이 없어요" 화면이 나오면 쿠키 연동 성공. 시크릿 창(로그인 안 됨)에서는 로그인 유도 화면이 나와야 한다.

- [ ] **Step 2: 감지 테스트 (라프텔 또는 크런치롤)**

애니 에피소드 페이지에서 10초 이상 머문 뒤 다른 페이지로 이동 → 익스텐션 아이콘에 빨간 배지(●)가 뜨는지 확인.

- [ ] **Step 3: 기록 테스트**

배지 상태에서 아이콘 클릭 → 감지된 애니 확인 → 평점/한줄평 입력 → "기록하기" → "기록 완료! ✓" 확인 → animesquad.me 워치리스트에서 해당 회차 기록 확인.

- [ ] **Step 4: 분기 테스트**

- 평점·한줄평 둘 다 비우고 기록 → 진도(progress)만 올라가는지 확인
- 워치리스트에 없는 애니 감지 → ⚠ 경고 문구 + 기록 시 자동 추가 확인
- 매칭 실패 케이스(이상한 제목) → 검색창으로 수동 선택 확인

- [ ] **Step 5: `MIN_WATCH_SECONDS`를 600으로 복원 후 최종 커밋**

```bash
git add chrome-extension/
git commit -m "test(extension): restore MIN_WATCH_SECONDS after manual testing"
```

---

## 스코프 외 (설계 문서와 동일)

- 전체 감상평 (`PATCH /api/watch/{animeId}`의 score/comment) — 초기 버전 제외
- 왓챠, 웨이브 등 추가 사이트 — 추후 확장
- 자동 다음화 감지 (넷플릭스 자동재생) — 추후 고려
- Chrome Web Store 배포 — 별도 작업

## 알려진 한계

- 쿠키 재사용 방식이라 animesquad.me 웹 로그인이 만료되면(JWT TTL 30일) 익스텐션도 함께 로그아웃된다. 팝업이 로그인 유도 화면을 보여주므로 UX상 자연스럽게 복구된다.
- `chrome.action.openPopup()`은 user gesture 없이는 실패하는 것이 정상 동작이며, 배지가 기본 알림 경로다.
- 로컬 개발 백엔드(localhost:8080)로 테스트하려면 `shared/api.js`의 `API_BASE`와 manifest의 `host_permissions`를 함께 바꿔야 한다.
