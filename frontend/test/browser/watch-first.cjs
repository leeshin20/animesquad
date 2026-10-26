// Run against `pnpm start --port 3117`; all API requests are isolated fixtures.
const { chromium } = require(process.env.ASQ_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const origin = 'http://localhost:3117';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.ASQ_CHROMIUM_PATH, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const anime = { id: 10, anilistId: 1, titleRomaji: 'Frieren', titleKorean: '장송의 프리렌', titleNative: 'F', titleEnglish: null, searchKeywords: null, episodes: 60, coverImageUrl: null, format: 'TV', status: 'FINISHED', seasonYear: 2023, season: 'FALL' };
    const user = { id: 7, displayName: '울라리', email: 'fixture@example.test', avatarUrl: null, onboardingComplete: true, profileVisibility: 'SQUAD_ONLY' };
    const entry = { id: 1, anime, progress: 3, status: 'WATCHING', score: null, comment: null, createdAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T01:00:00Z' };
    const writes = [], errors = [];
    const event = ep => ({ id: ep, type: 'PROGRESS_UPDATED', actor: user, anime, payload: { progress: ep, episode: ep, episodeWatchId: 100 + ep }, createdAt: new Date(Date.UTC(2026, 9, 26, 0, ep * 25)).toISOString() });
    let events = [event(3), event(2), event(1)];
    let history = [3, 2, 1].map(ep => ({ id: 100 + ep, anime, episodeNumber: ep, recordedAt: event(ep).createdAt, source: 'EXTENSION' }));
    let holdReviews = false, releaseReviews;
    const reviews = [{ id: 1, episodeNumber: 3, score: 4, comment: '기존 감상' }];
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (!url.pathname.startsWith('/api/')) {
        if (url.origin === origin) return route.continue();
        return route.abort();
      }
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      let data;
      if (req.method() !== 'GET') {
        const body = req.postDataJSON(); writes.push({ method: req.method(), path: url.pathname, body });
        if (url.pathname === '/api/watch/10/progress') {
          entry.progress = Math.max(entry.progress, body.progress);
          if (!history.some(r => r.episodeNumber === body.progress)) {
            history.unshift({ id: 100 + body.progress, anime, episodeNumber: body.progress, recordedAt: event(body.progress).createdAt, source: body.source });
            events.unshift(event(body.progress));
          }
          data = entry;
        } else if (url.pathname === '/api/watch/10' && req.method() === 'PATCH') {
          if (body.progress != null) entry.progress = body.progress; data = entry;
        } else if (url.pathname.startsWith('/api/me/episode-watches/')) {
          history = history.filter(r => r.id !== Number(url.pathname.split('/').pop()));
          return route.fulfill({ status: 204, headers });
        } else data = {};
      } else if (url.pathname === '/api/me') data = user;
      else if (url.pathname === '/api/watch') data = [entry];
      else if (url.pathname === '/api/watch/10') data = entry;
      else if (url.pathname === '/api/watch/10/episodes') {
        if (holdReviews) await new Promise(resolve => { releaseReviews = resolve; });
        data = reviews;
      }
      else if (url.pathname === '/api/squad') data = [{ id: 1, name: '테스트 스쿼드' }];
      else if (url.pathname === '/api/squad/1/feed') data = events;
      else if (url.pathname === '/api/me/episode-watches') {
        const cursor = Number(url.searchParams.get('cursor') || Infinity);
        data = history.filter(r => r.id < cursor).slice(0, Number(url.searchParams.get('limit') || 50));
      } else if (url.pathname === '/api/me/episode-reviews') data = [];
      else throw new Error(`Unexpected API ${req.method()} ${url.pathname}`);
      return route.fulfill({ status: 200, headers, json: data });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole('button', { name: '4화 시청함', exact: true }).waitFor();
    assert.equal(await page.locator('textarea').count(), 0);
    assert.equal(await page.getByText('1~3화 시청', { exact: true }).count(), 1);
    assert.equal(await page.getByText('별점 없음', { exact: true }).count(), 0);
    await page.getByRole('button', { name: '4화 시청함', exact: true }).click();
    await page.getByRole('button', { name: '5화 시청함', exact: true }).waitFor();
    assert.deepEqual(writes[0], { method: 'POST', path: '/api/watch/10/progress', body: { progress: 4, source: 'MANUAL' } });
    assert.equal(await page.locator('textarea').count(), 0);
    await page.screenshot({ path: path.join(process.env.ASQ_ARTIFACT_DIR || '/tmp', 'animesquad-watch-first-home.png'), fullPage: true });
    await page.goto(origin + '/watchlist/history');
    await page.getByText('장송의 프리렌 · 3화 시청', { exact: true }).waitFor();
    assert.ok(await page.getByText('확장 프로그램', { exact: false }).count() > 0);
    holdReviews = true;
    await page.getByRole('listitem').filter({ hasText: '장송의 프리렌 · 3화 시청' }).getByRole('button', { name: '감상 남기기', exact: true }).click();
    await page.locator('textarea').waitFor();
    assert.equal(await page.locator('textarea').isDisabled(), true);
    while (!releaseReviews) await new Promise(resolve => setTimeout(resolve, 10));
    holdReviews = false; releaseReviews();
    await page.waitForFunction(() => document.querySelector('textarea')?.value === '기존 감상');
    assert.equal(await page.locator('textarea').isDisabled(), false);
    assert.equal(await page.locator('input[inputmode="numeric"]').inputValue(), '3');
    await page.locator('textarea').fill('나중에 추가한 감상');
    await page.getByRole('button', { name: '감상 저장', exact: true }).click();
    await page.getByRole('button', { name: '수정', exact: true }).click();
    await page.locator('textarea').waitFor({ state: 'detached' });
    assert.deepEqual(writes[1], { method: 'PUT', path: '/api/watch/10/episodes/3', body: { score: 4, comment: '나중에 추가한 감상' } });
    assert.equal(history.find(r => r.episodeNumber === 3).recordedAt, event(3).createdAt);
    await page.getByRole('button', { name: '4화 시청 기록 삭제', exact: true }).click();
    await page.getByRole('button', { name: '삭제', exact: true }).click();
    await page.getByText('장송의 프리렌 · 4화 시청', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(writes[2].path, '/api/me/episode-watches/104');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(process.env.ASQ_ARTIFACT_DIR || '/tmp', 'animesquad-watch-first-history-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    history = Array.from({ length: 51 }, (_, i) => {
      const ep = 51 - i;
      return { id: 1000 + ep, anime, episodeNumber: ep, recordedAt: event(ep).createdAt, source: 'MANUAL' };
    });
    await page.reload();
    await page.getByText('장송의 프리렌 · 2화 시청', { exact: true }).waitFor();
    assert.equal(await page.getByText('장송의 프리렌 · 1화 시청', { exact: true }).count(), 0);
    await page.getByRole('button', { name: '더 보기', exact: true }).click();
    await page.getByText('장송의 프리렌 · 1화 시청', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '더 보기', exact: true }).count(), 0);
    const historyCount = history.length;
    await page.goto(origin + '/watchlist/anime');
    await page.getByRole('button', { name: '보는 중', exact: true }).click();
    await page.getByRole('spinbutton', { name: '현재 진도', exact: true }).fill('3');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByRole('spinbutton', { name: '현재 진도', exact: true }).waitFor({ state: 'detached' });
    assert.equal(writes.at(-1).method, 'PATCH');
    assert.equal(writes.at(-1).path, '/api/watch/10');
    assert.equal(writes.at(-1).body.progress, 3);
    assert.equal(history.length, historyCount);
    await page.getByRole('button', { name: '보는 중', exact: true }).click();
    entry.progress = 8; // An extension record arrives while the management form is open.
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByRole('spinbutton', { name: '현재 진도', exact: true }).waitFor({ state: 'detached' });
    assert.equal(Object.hasOwn(writes.at(-1).body, 'progress'), false);
    assert.equal(entry.progress, 8);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, writes, checked: ['grouped feed', 'watch without review', 'existing review loaded for exact episode', 'review edit', 'owned history deletion', 'mobile overflow', 'history raw cursor pagination', 'delayed review hydration protection', 'overall progress correction', 'unchanged progress preserves concurrent auto records'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
