# Chrome Extension — 스트리밍 사이트 애니 자동 감지 및 기록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 넷플릭스, 라프텔, 크런치롤에서 애니 시청 후 페이지를 벗어날 때 animesquad에 회차 기록을 남길 수 있도록 안내하는 Chrome 확장프로그램을 구현한다.

**Architecture:** Chrome Extension (Manifest V3) — Content Script(제목 파싱/시청 감지), Service Worker(JWT 관리/API 호출), Popup(로그인/기록 폼) 3개 컴포넌트. 백엔드에 Google ID 토큰을 받아 JWT를 발급하는 `POST /api/auth/google` 엔드포인트를 추가하고, 확장프로그램의 Service Worker가 animesquad API를 직접 호출한다.

**Tech Stack:** Vanilla JS (Chrome Extension), Spring Boot (backend), JJWT, Google tokeninfo API, chrome.identity, chrome.storage.local

---

## File Map

### 신규 (백엔드)
- `backend/src/main/java/com/animesquad/auth/GoogleTokenVerifier.java` — Google ID 토큰 검증 인터페이스
- `backend/src/main/java/com/animesquad/auth/GoogleRestTokenVerifier.java` — Google tokeninfo REST 구현체
- `backend/src/main/java/com/animesquad/auth/GoogleTokenAuthController.java` — `POST /api/auth/google`
- `backend/src/test/java/com/animesquad/auth/GoogleTokenAuthControllerIT.java` — 통합 테스트

### 수정 (백엔드)
- `backend/src/main/java/com/animesquad/auth/SecurityConfig.java` — `/api/auth/google` 인증 제외

### 신규 (크롬 익스텐션)
- `chrome-extension/manifest.json` — Manifest V3 설정
- `chrome-extension/content/index.js` — Content Script (제목 파싱, 시청 시간, URL 감지)
- `chrome-extension/background/service-worker.js` — JWT 관리, Google OAuth, API 호출
- `chrome-extension/popup/index.html` — 팝업 HTML
- `chrome-extension/popup/popup.js` — 팝업 로직
- `chrome-extension/popup/popup.css` — 팝업 스타일
- `chrome-extension/icons/icon128.png` — 아이콘 (placeholder)

---

## Task 1: 백엔드 — Google ID 토큰 검증 인터페이스 + SecurityConfig 수정

**Files:**
- Create: `backend/src/main/java/com/animesquad/auth/GoogleTokenVerifier.java`
- Create: `backend/src/main/java/com/animesquad/auth/GoogleRestTokenVerifier.java`
- Modify: `backend/src/main/java/com/animesquad/auth/SecurityConfig.java`

- [ ] **Step 1: GoogleTokenVerifier 인터페이스 생성**

```java
// backend/src/main/java/com/animesquad/auth/GoogleTokenVerifier.java
package com.animesquad.auth;

public interface GoogleTokenVerifier {
    Claims verify(String idToken);

    record Claims(String sub, String email, String name, String picture) {}
}
```

- [ ] **Step 2: GoogleRestTokenVerifier 구현체 생성**

Google의 `https://oauth2.googleapis.com/tokeninfo?id_token={token}` 엔드포인트를 호출해 검증한다.

```java
// backend/src/main/java/com/animesquad/auth/GoogleRestTokenVerifier.java
package com.animesquad.auth;

import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.Map;

@Component
public class GoogleRestTokenVerifier implements GoogleTokenVerifier {

    private static final String TOKENINFO_URL =
        "https://oauth2.googleapis.com/tokeninfo?id_token=";

    private final RestClient restClient = RestClient.create();

    @Override
    @SuppressWarnings("unchecked")
    public Claims verify(String idToken) {
        Map<String, Object> body;
        try {
            body = restClient.get()
                .uri(TOKENINFO_URL + idToken)
                .retrieve()
                .body(Map.class);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid Google token");
        }
        if (body == null || !body.containsKey("sub")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid Google token");
        }
        return new Claims(
            (String) body.get("sub"),
            (String) body.get("email"),
            (String) body.getOrDefault("name", ""),
            (String) body.getOrDefault("picture", "")
        );
    }
}
```

- [ ] **Step 3: SecurityConfig에서 `/api/auth/google` 인증 제외**

`backend/src/main/java/com/animesquad/auth/SecurityConfig.java` 의 `authorizeHttpRequests` 블록에서 `/api/auth/google`을 `permitAll` 규칙으로 먼저 추가한다.

기존:
```java
.authorizeHttpRequests(a -> a
    .requestMatchers("/api/**").authenticated()
    .anyRequest().permitAll())
```

변경 후:
```java
.authorizeHttpRequests(a -> a
    .requestMatchers("/api/auth/google").permitAll()
    .requestMatchers("/api/**").authenticated()
    .anyRequest().permitAll())
```

- [ ] **Step 4: 빌드 확인**

```bash
cd /Users/yubeen/animesquad/backend
./gradlew compileJava
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/animesquad/auth/GoogleTokenVerifier.java \
        backend/src/main/java/com/animesquad/auth/GoogleRestTokenVerifier.java \
        backend/src/main/java/com/animesquad/auth/SecurityConfig.java
git commit -m "feat(auth): add Google ID token verifier and permit /api/auth/google"
```

---

## Task 2: 백엔드 — `POST /api/auth/google` 컨트롤러 (TDD)

**Files:**
- Create: `backend/src/main/java/com/animesquad/auth/GoogleTokenAuthController.java`
- Create: `backend/src/test/java/com/animesquad/auth/GoogleTokenAuthControllerIT.java`

- [ ] **Step 1: 실패하는 테스트 작성**

```java
// backend/src/test/java/com/animesquad/auth/GoogleTokenAuthControllerIT.java
package com.animesquad.auth;

import com.animesquad.support.AbstractIntegrationTest;
import com.animesquad.user.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GoogleTokenAuthControllerIT extends AbstractIntegrationTest {

    @Autowired TestRestTemplate rest;
    @Autowired UserService userService;
    @MockBean GoogleTokenVerifier googleTokenVerifier;

    @Test
    void validToken_returnsJwt() {
        when(googleTokenVerifier.verify("valid-google-token"))
            .thenReturn(new GoogleTokenVerifier.Claims(
                "google-sub-123", "test@example.com", "Test User", ""
            ));

        var body = Map.of("idToken", "valid-google-token");
        var response = rest.postForEntity("/api/auth/google", body, Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsKey("token");
        assertThat((String) response.getBody().get("token")).isNotBlank();
    }

    @Test
    void invalidToken_returns401() {
        when(googleTokenVerifier.verify("bad-token"))
            .thenThrow(new org.springframework.web.server.ResponseStatusException(
                HttpStatus.UNAUTHORIZED, "invalid Google token"));

        var body = Map.of("idToken", "bad-token");
        var response = rest.postForEntity("/api/auth/google", body, Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd /Users/yubeen/animesquad/backend
./gradlew test --tests "com.animesquad.auth.GoogleTokenAuthControllerIT" 2>&1 | tail -20
```

Expected: FAILED (GoogleTokenAuthController 없음)

- [ ] **Step 3: 컨트롤러 구현**

```java
// backend/src/main/java/com/animesquad/auth/GoogleTokenAuthController.java
package com.animesquad.auth;

import com.animesquad.user.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class GoogleTokenAuthController {

    private final GoogleTokenVerifier verifier;
    private final UserService userService;
    private final JwtService jwtService;

    public GoogleTokenAuthController(
        GoogleTokenVerifier verifier,
        UserService userService,
        JwtService jwtService
    ) {
        this.verifier = verifier;
        this.userService = userService;
        this.jwtService = jwtService;
    }

    @PostMapping("/google")
    public ResponseEntity<Map<String, String>> googleAuth(@RequestBody Map<String, String> body) {
        String idToken = body.get("idToken");
        var claims = verifier.verify(idToken);
        var user = userService.upsertFromGoogle(
            claims.sub(), claims.email(), claims.name(), claims.picture()
        );
        String jwt = jwtService.issue(user.getId());
        return ResponseEntity.ok(Map.of("token", jwt));
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/yubeen/animesquad/backend
./gradlew test --tests "com.animesquad.auth.GoogleTokenAuthControllerIT" 2>&1 | tail -10
```

Expected: `2 tests completed, 0 failed`

- [ ] **Step 5: 전체 테스트 통과 확인**

```bash
./gradlew test 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/animesquad/auth/GoogleTokenAuthController.java \
        backend/src/test/java/com/animesquad/auth/GoogleTokenAuthControllerIT.java
git commit -m "feat(auth): POST /api/auth/google — issue JWT from Google ID token"
```

---

## Task 3: 크롬 익스텐션 — 프로젝트 셋업

**Files:**
- Create: `chrome-extension/manifest.json`
- Create: `chrome-extension/icons/icon128.png` (placeholder)

Google OAuth 클라이언트 ID가 필요하다. [Google Cloud Console](https://console.cloud.google.com/) → API & Services → Credentials에서 "Chrome App"용 OAuth 2.0 클라이언트 ID를 생성한다. Application type: "Chrome extension". 생성 후 클라이언트 ID를 복사해둔다.

- [ ] **Step 1: manifest.json 생성**

`YOUR_GOOGLE_CLIENT_ID`를 위에서 복사한 실제 클라이언트 ID로 교체한다.
`https://api.animesquad.me` 는 실제 백엔드 URL로 확인 후 교체한다 (CORS 우회를 위한 host_permissions).

```json
// chrome-extension/manifest.json
{
  "manifest_version": 3,
  "name": "AnimeSquad",
  "version": "1.0.0",
  "description": "넷플릭스, 라프텔, 크런치롤에서 애니 시청 기록을 animesquad에 남기세요.",
  "permissions": [
    "storage",
    "identity",
    "tabs"
  ],
  "host_permissions": [
    "https://www.netflix.com/*",
    "https://laftel.net/*",
    "https://www.crunchyroll.com/*",
    "https://animesquad-api.onrender.com/*"
  ],
  "oauth2": {
    "client_id": "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["openid", "email", "profile"]
  },
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
      "js": ["content/index.js"]
    }
  ],
  "action": {
    "default_popup": "popup/index.html",
    "default_icon": {
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: 아이콘 placeholder 생성**

```bash
mkdir -p /Users/yubeen/animesquad/chrome-extension/icons
# 128x128 빈 PNG 파일 생성 (나중에 실제 아이콘으로 교체)
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

- [ ] **Step 3: 디렉토리 구조 생성**

```bash
mkdir -p /Users/yubeen/animesquad/chrome-extension/content
mkdir -p /Users/yubeen/animesquad/chrome-extension/background
mkdir -p /Users/yubeen/animesquad/chrome-extension/popup
```

- [ ] **Step 4: 커밋**

```bash
git add chrome-extension/
git commit -m "chore(extension): Chrome extension project setup (manifest + structure)"
```

---

## Task 4: Content Script — 사이트별 제목 파서

**Files:**
- Create: `chrome-extension/content/index.js`

- [ ] **Step 1: 파서 + 시청 감지 로직 작성**

`MIN_WATCH_SECONDS`를 넘긴 뒤 URL이 변경되면 Service Worker로 메시지를 보낸다.

```js
// chrome-extension/content/index.js
const MIN_WATCH_SECONDS = 600; // 10분

const PARSERS = [
  {
    host: 'crunchyroll.com',
    parse(title) {
      // "Frieren: Beyond Journey's End - Episode 11 - ..."
      const epMatch = title.match(/[-–]\s*Episode\s*(\d+)/i);
      const ep = epMatch ? parseInt(epMatch[1]) : null;
      const animeName = title.split(/[-–]\s*Episode/i)[0].trim();
      return animeName ? { animeName, ep } : null;
    },
  },
  {
    host: 'netflix.com',
    parse(title) {
      // "Episode 11 | Frieren: Beyond Journey's End | Netflix"
      // or "Frieren: Beyond Journey's End | Netflix"
      const cleaned = title.replace(/\|\s*Netflix\s*$/i, '').trim();
      const epMatch = cleaned.match(/Episode\s*(\d+)/i);
      const ep = epMatch ? parseInt(epMatch[1]) : null;
      const animeName = cleaned.replace(/Episode\s*\d+\s*[|]?\s*/i, '').replace(/\|\s*.*$/, '').trim();
      return animeName ? { animeName, ep } : null;
    },
  },
  {
    host: 'laftel.net',
    parse(title) {
      // "장송의 프리렌 11화 - 라프텔"
      const cleaned = title.replace(/[-–]\s*라프텔\s*$/i, '').trim();
      const epMatch = cleaned.match(/(\d+)화/);
      const ep = epMatch ? parseInt(epMatch[1]) : null;
      const animeName = cleaned.replace(/\s*\d+화.*$/, '').trim();
      return animeName ? { animeName, ep } : null;
    },
  },
];

function getParser() {
  return PARSERS.find(p => location.hostname.includes(p.host)) ?? null;
}

let startTime = Date.now();
let lastUrl = location.href;
let lastParsed = null;

function parseCurrent() {
  const parser = getParser();
  if (!parser) return null;
  return parser.parse(document.title);
}

// 제목이 바뀌면 재파싱 + 타이머 리셋
const titleObserver = new MutationObserver(() => {
  const parsed = parseCurrent();
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

// URL 변경 감지 (SPA 대응)
function onNavigate() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;

  const elapsed = (Date.now() - startTime) / 1000;
  if (elapsed >= MIN_WATCH_SECONDS && lastParsed) {
    chrome.runtime.sendMessage({ type: 'WATCHED', payload: lastParsed });
  }

  // 새 페이지에서 리셋
  startTime = Date.now();
  lastParsed = parseCurrent();
}

// History API 후킹
const _pushState = history.pushState.bind(history);
const _replaceState = history.replaceState.bind(history);
history.pushState = (...args) => { _pushState(...args); onNavigate(); };
history.replaceState = (...args) => { _replaceState(...args); onNavigate(); };
window.addEventListener('popstate', onNavigate);

// 초기 파싱
lastParsed = parseCurrent();
```

- [ ] **Step 2: 커밋**

```bash
git add chrome-extension/content/index.js
git commit -m "feat(extension): content script — title parsing and watch detection"
```

---

## Task 5: Service Worker — JWT 관리 + Google OAuth + animesquad API 호출

**Files:**
- Create: `chrome-extension/background/service-worker.js`

실제 백엔드 URL을 `API_BASE`에 설정해야 한다. Render 백엔드의 URL을 확인한다 (예: `https://animesquad-api.onrender.com`).

- [ ] **Step 1: Service Worker 작성**

```js
// chrome-extension/background/service-worker.js
const API_BASE = 'https://animesquad-api.onrender.com'; // 실제 백엔드 URL로 교체

// ── JWT 관리 ──────────────────────────────────────────────
async function getToken() {
  const { jwt } = await chrome.storage.local.get('jwt');
  return jwt ?? null;
}

async function setToken(token) {
  await chrome.storage.local.set({ jwt: token });
}

async function clearToken() {
  await chrome.storage.local.remove('jwt');
}

// ── Google OAuth → animesquad JWT ────────────────────────
async function login() {
  // chrome.identity.getAuthToken은 access_token만 준다.
  // ID token을 얻으려면 launchWebAuthFlow + OIDC nonce 방식을 사용한다.
  return new Promise((resolve, reject) => {
    const clientId = chrome.runtime.getManifest().oauth2.client_id;
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
    const nonce = Math.random().toString(36).slice(2);
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${clientId}` +
      `&response_type=id_token` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=openid%20email%20profile` +
      `&nonce=${nonce}`;

    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          return reject(new Error(chrome.runtime.lastError?.message ?? 'auth cancelled'));
        }
        const hash = new URL(responseUrl).hash.slice(1);
        const params = new URLSearchParams(hash);
        const idToken = params.get('id_token');
        if (!idToken) return reject(new Error('no id_token in response'));

        const res = await fetch(`${API_BASE}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        if (!res.ok) return reject(new Error('backend auth failed'));
        const { token } = await res.json();
        await setToken(token);
        resolve(token);
      }
    );
  });
}

// ── animesquad API 헬퍼 ───────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  return res;
}

async function searchAnime(query) {
  const res = await apiFetch(`/api/anime/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  return res.json();
}

async function ensureInWatchlist(animeId) {
  const check = await apiFetch(`/api/watch/${animeId}`);
  if (check.status === 404) {
    await apiFetch('/api/watch', {
      method: 'POST',
      body: JSON.stringify({ animeId }),
    });
  }
}

async function recordEpisode(animeId, ep, rating, comment) {
  await apiFetch(`/api/watch/${animeId}/episodes/${ep}`, {
    method: 'PUT',
    body: JSON.stringify({ rating, comment }),
  });
}

// ── 메시지 핸들러 ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'WATCHED') {
      const { animeName, ep } = msg.payload;
      const results = await searchAnime(animeName);
      // 팝업에 감지 결과 전달 (팝업이 열리면 이 데이터를 사용)
      await chrome.storage.local.set({
        pending: { animeName, ep, results },
      });
      // 팝업 자동 오픈
      chrome.action.openPopup().catch(() => {
        // openPopup은 user gesture 없이 실패할 수 있음 — 배지로 fallback
        chrome.action.setBadgeText({ text: '●' });
        chrome.action.setBadgeBackgroundColor({ color: '#e53e3e' });
      });
      sendResponse({ ok: true });
    }

    if (msg.type === 'LOGIN') {
      try {
        await login();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    }

    if (msg.type === 'LOGOUT') {
      await clearToken();
      sendResponse({ ok: true });
    }

    if (msg.type === 'GET_TOKEN') {
      sendResponse({ token: await getToken() });
    }

    if (msg.type === 'RECORD') {
      const { animeId, ep, rating, comment } = msg.payload;
      try {
        await ensureInWatchlist(animeId);
        await recordEpisode(animeId, ep, rating, comment);
        await chrome.storage.local.remove('pending');
        chrome.action.setBadgeText({ text: '' });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    }

    if (msg.type === 'SEARCH_ANIME') {
      const results = await searchAnime(msg.query);
      sendResponse({ results });
    }
  })();
  return true; // async response
});
```

- [ ] **Step 2: 커밋**

```bash
git add chrome-extension/background/service-worker.js
git commit -m "feat(extension): service worker — Google OAuth, JWT, animesquad API"
```

---

## Task 6: Popup — HTML + CSS

**Files:**
- Create: `chrome-extension/popup/index.html`
- Create: `chrome-extension/popup/popup.css`

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
    <!-- 로그인 화면 -->
    <div id="view-login" class="view hidden">
      <h1>AnimeSquad</h1>
      <button id="btn-login">Google로 로그인</button>
    </div>

    <!-- 기록 화면 -->
    <div id="view-record" class="view hidden">
      <h1>AnimeSquad</h1>
      <div id="anime-info">
        <p id="anime-label"></p>
        <p id="watchlist-warning" class="warning hidden">⚠ 워치리스트에 추가됩니다.</p>
      </div>

      <!-- 매칭 실패 시 검색창 -->
      <div id="search-section" class="hidden">
        <input id="search-input" type="text" placeholder="애니 검색..." />
        <ul id="search-results"></ul>
        <label>화수 <input id="ep-input" type="number" min="1" /></label>
      </div>

      <!-- 평점 -->
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

      <input id="comment-input" type="text" placeholder="한줄평 (선택)" maxlength="200" />

      <div class="btn-row">
        <button id="btn-record">기록하기</button>
        <button id="btn-dismiss" class="secondary">무시</button>
      </div>
    </div>

    <!-- 완료 화면 -->
    <div id="view-done" class="view hidden">
      <p class="done-msg">기록 완료! ✓</p>
    </div>
  </div>
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

h1 { font-size: 18px; font-weight: 700; color: #e879f9; margin-bottom: 16px; }

.hidden { display: none !important; }

.view { display: flex; flex-direction: column; gap: 12px; }

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

.rating-row { display: flex; align-items: center; gap: 10px; }
#stars { display: flex; gap: 4px; }
.star { font-size: 22px; color: #555; cursor: pointer; user-select: none; }
.star.active { color: #fbbf24; }

.btn-row { display: flex; gap: 8px; }
.btn-row button { flex: 1; }

ul { list-style: none; max-height: 120px; overflow-y: auto; border: 1px solid #444; border-radius: 6px; }
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

## Task 7: Popup — 로직 (popup.js)

**Files:**
- Create: `chrome-extension/popup/popup.js`

- [ ] **Step 1: popup.js 작성**

```js
// chrome-extension/popup/popup.js
let selectedAnime = null;  // { id, titleKorean, titleRomaji, ... }
let selectedEp = null;
let selectedRating = null;
let isLoggedIn = false;

const $ = id => document.getElementById(id);

function showView(id) {
  ['view-login', 'view-record', 'view-done'].forEach(v => {
    document.getElementById(v).classList.toggle('hidden', v !== id);
  });
}

// ── 초기화 ────────────────────────────────────────────────
async function init() {
  const { token } = await chrome.runtime.sendMessage({ type: 'GET_TOKEN' });
  if (!token) {
    showView('view-login');
    return;
  }

  isLoggedIn = true;

  const { pending } = await chrome.storage.local.get('pending');
  if (!pending) {
    // 대기 중인 기록이 없으면 로그아웃 버튼만 표시
    showView('view-login');
    $('btn-login').textContent = '로그아웃';
    return;
  }

  showView('view-record');
  loadRecord(pending);
}

function loadRecord({ animeName, ep, results }) {
  selectedEp = ep;

  if (results && results.length > 0) {
    selectedAnime = results[0];
    $('anime-label').textContent =
      `${selectedAnime.titleKorean || selectedAnime.titleRomaji} ${ep ? ep + '화' : ''} 기록할까요?`;
    $('search-section').classList.add('hidden');
  } else {
    $('anime-label').textContent = `"${animeName}" 을(를) 찾지 못했습니다. 직접 검색하세요.`;
    $('search-section').classList.remove('hidden');
    $('search-input').value = animeName;
    $('ep-input').value = ep ?? '';
    setupSearch();
  }
}

// ── 검색 ──────────────────────────────────────────────────
function setupSearch() {
  let debounceTimer;
  $('search-input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const q = $('search-input').value.trim();
      if (!q) return;
      const { results } = await chrome.runtime.sendMessage({ type: 'SEARCH_ANIME', query: q });
      renderResults(results);
    }, 300);
  });
}

function renderResults(results) {
  const ul = $('search-results');
  ul.innerHTML = '';
  results.slice(0, 8).forEach(a => {
    const li = document.createElement('li');
    li.textContent = a.titleKorean || a.titleRomaji;
    li.addEventListener('click', () => {
      selectedAnime = a;
      [...ul.querySelectorAll('li')].forEach(el => el.classList.remove('selected'));
      li.classList.add('selected');
      $('anime-label').textContent =
        `${a.titleKorean || a.titleRomaji} 기록할까요?`;
    });
    ul.appendChild(li);
  });
}

// ── 별점 ──────────────────────────────────────────────────
document.querySelectorAll('.star').forEach(star => {
  star.addEventListener('click', () => {
    selectedRating = parseInt(star.dataset.v);
    document.querySelectorAll('.star').forEach(s => {
      s.classList.toggle('active', parseInt(s.dataset.v) <= selectedRating);
    });
  });
});

// ── 버튼 ──────────────────────────────────────────────────
// 로그인/로그아웃 — isLoggedIn 상태에 따라 분기 (리스너는 한 번만)
$('btn-login').addEventListener('click', async () => {
  if (isLoggedIn) {
    await chrome.runtime.sendMessage({ type: 'LOGOUT' });
    window.close();
    return;
  }
  const res = await chrome.runtime.sendMessage({ type: 'LOGIN' });
  if (res.ok) init();
});

$('btn-dismiss').addEventListener('click', async () => {
  await chrome.storage.local.remove('pending');
  window.close();
});

$('btn-record').addEventListener('click', async () => {
  if (!selectedAnime) { alert('애니를 선택해주세요.'); return; }

  const ep = selectedEp ?? parseInt($('ep-input')?.value);
  if (!ep) { alert('화수를 입력해주세요.'); return; }

  const comment = $('comment-input').value.trim();

  const res = await chrome.runtime.sendMessage({
    type: 'RECORD',
    payload: {
      animeId: selectedAnime.id,
      ep,
      rating: selectedRating,
      comment: comment || null,
    },
  });

  if (res.ok) {
    showView('view-done');
    setTimeout(() => window.close(), 1200);
  } else {
    alert('기록 실패: ' + res.error);
  }
});

init();
```

- [ ] **Step 2: 커밋**

```bash
git add chrome-extension/popup/popup.js
git commit -m "feat(extension): popup logic — login, record form, search, star rating"
```

---

## Task 8: 크롬 익스텐션 로컬 테스트

Chrome에서 `chrome://extensions` → "개발자 모드" 활성화 → "압축해제된 확장 프로그램 로드" → `chrome-extension/` 폴더 선택.

- [ ] **Step 1: manifest.json의 `client_id`와 `API_BASE` 값 설정 확인**

```
chrome-extension/manifest.json  → oauth2.client_id 실제 값으로 교체
chrome-extension/background/service-worker.js → API_BASE 실제 백엔드 URL로 교체
```

- [ ] **Step 2: 로그인 테스트**

확장프로그램 아이콘 클릭 → "Google로 로그인" → Google 계정 선택 → 팝업이 닫히고 재오픈 시 로그인 상태인지 확인.

- [ ] **Step 3: 크런치롤 감지 테스트**

크런치롤에서 아무 에피소드를 10초간(테스트용으로 `MIN_WATCH_SECONDS = 10` 임시 변경) 보다가 다른 URL로 이동 → 팝업 자동 오픈 또는 배지 뜨는지 확인.

- [ ] **Step 4: 기록 테스트**

팝업에서 평점/한줄평 입력 후 "기록하기" → animesquad.me에서 해당 회차 기록이 생성되었는지 확인.

- [ ] **Step 5: `MIN_WATCH_SECONDS` 원래 값(600)으로 복원 후 최종 커밋**

```bash
# content/index.js의 MIN_WATCH_SECONDS를 600으로 복원한 뒤:
git add chrome-extension/
git commit -m "feat(extension): restore MIN_WATCH_SECONDS to 600 after local testing"
```
