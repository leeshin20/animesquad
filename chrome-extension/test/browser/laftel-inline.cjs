// Run with Playwright, extension-capable Chromium and ffmpeg (or ASQ_VIDEO_FIXTURE).
// All viewing writes target a disposable local server.
const { chromium } = require(process.env.ASQ_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const artifacts = process.env.ASQ_ARTIFACT_DIR || os.tmpdir();
(async () => {
  let context;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asq-auto-test-'));
  const writes = [];
  let progress = 0;
  const server = http.createServer(async (req, res) => {
    if (req.url === '/avatar.svg') { res.setHeader('content-type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="#22C55E"/></svg>'); return; }
    res.setHeader('content-type', 'application/json');
    if (req.method !== 'GET') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      writes.push({ method: req.method, path: req.url, payload });
      if (req.url === '/api/watch/1516/progress') progress = Math.max(progress, payload.progress);
    }
    const value = req.url === '/api/me' ? { id: 7, displayName: '프리렌팬', email: 'frieren@example.com', avatarUrl: base + '/avatar.svg' }
      : req.url.includes('/platform-links/') ? { id: 1516, titleKorean: '장송의 프리렌' }
      : req.url.includes('/search') ? [] : { progress };
    res.end(JSON.stringify(value));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const videoPath = process.env.ASQ_VIDEO_FIXTURE || path.join(dir, 'video.mp4');
    if (!process.env.ASQ_VIDEO_FIXTURE) {
      execFileSync(process.env.ASQ_FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=32x32:r=1', '-t', '1440', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', videoPath]);
    }
    const ext = path.join(dir, 'extension');
    fs.cpSync(root, ext, { recursive: true });
    const api = path.join(ext, 'shared/api.js');
    fs.writeFileSync(api, fs.readFileSync(api, 'utf8').replace('https://api.animesquad.me', base));
    const manifestPath = path.join(ext, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    manifest.host_permissions = [base + '/*'];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    context = await chromium.launchPersistentContext(path.join(dir, 'profile'), {
      executablePath: process.env.ASQ_CHROMIUM_PATH || chromium.executablePath(),
      headless: true, viewport: { width: 1100, height: 900 },
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--disable-gpu'],
    });
    await context.route('https://laftel.net/**', (route) => {
      if (route.request().url().includes('asq-fixture.mp4')) {
        const bytes = fs.readFileSync(videoPath);
        const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
        if (!range) return route.fulfill({ contentType: 'video/mp4', headers: { 'accept-ranges': 'bytes' }, body: bytes });
        const start = Number(range[1]);
        const end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
        return route.fulfill({ status: 206, contentType: 'video/mp4', headers: {
          'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${bytes.length}`,
        }, body: bytes.subarray(start, end + 1) });
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="UTF-8"><title>(자막) 장송의 프리렌 1화 다시보기 | 라프텔</title><style>body{font-family:sans-serif;margin:24px}video{width:100%;height:280px;background:#111}a{color:#555}#details{padding:16px 0}h2{font-size:19px}</style></head><body><h2>LAFTEL</h2><video muted preload="auto" src="/asq-fixture.mp4"></video><div id="details"><a href="/item/41666" style="display:block">(자막) 장송의 프리렌</a><h2>1화 모험의 끝</h2></div><p>회차 설명</p></body></html>` });
    });
    await context.route('https://api.animesquad.me/**', (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('https://laftel.net/player/41666/65123');
    await page.waitForFunction(() => document.querySelector('video').readyState >= 3);
    const host = page.locator('#animesquad-inline');
    await host.waitFor({ state: 'attached' });
    assert.equal(await host.count(), 1);
    assert.equal(await host.locator('[data-status]').innerText(), '🟢 자동 기록 중');
    await host.locator('[data-action="toggle"]').click();
    const panel = page.frameLocator('#animesquad-inline iframe');
    await panel.locator('#account-name').getByText('프리렌팬').waitFor();
    assert.equal(await panel.locator('#current-anime-meta').innerText(), '라프텔 · 1화');
    assert.equal(await panel.locator('#view-record').isVisible(), false);
    assert.equal(await panel.locator('body').innerText().then(text => text.includes('frieren@example.com')), false);
    await panel.locator('#account-avatar').evaluate(img => img.decode());
    assert.equal(await panel.locator('#account-avatar').evaluate(img => img.naturalWidth > 0), true);
    assert.ok((await host.locator('iframe').boundingBox()).height <= 180, 'waiting panel is compact');
    const playAt = async (seconds) => {
      await page.locator('video').evaluate(async (video, time) => { video.currentTime = time; await video.play(); }, seconds);
      await page.waitForFunction(() => { const v = document.querySelector('video'); return !v.seeking && v.readyState >= 3 && !v.paused; });
    };
    await page.locator('video').evaluate(video => { video.currentTime = 1440 * 0.8; });
    await page.waitForFunction(() => !document.querySelector('video').seeking);
    await page.waitForTimeout(1200);
    assert.equal(writes.length, 0, 'paused threshold does not auto-record');
    await panel.locator('#auto-record-status').getByText('재생하면 자동 기록').waitFor();
    assert.match(await panel.locator('#playback-status').innerText(), /80% · 일시정지/);
    await page.screenshot({ path: path.join(artifacts, 'animesquad-compact-waiting.png'), fullPage: true });
    await playAt(1440 * 0.79);
    await page.waitForTimeout(1200);
    assert.equal(writes.length, 0, '79% must not auto-record');
    assert.match(await panel.locator('#playback-status').innerText(), /79%/);
    await playAt(1440 * 0.8);
    await page.waitForTimeout(1500);
    await panel.locator('#auto-record-status').getByText(/시청 기록 저장 완료/).waitFor();
    assert.equal(progress, 1, '80% records without clicking record');
    assert.equal(await host.locator('[data-status]').innerText(), '🟢 자동 기록 중');
    assert.equal(await panel.locator('#comment-input').isVisible(), false);
    await panel.locator('.optional-review summary').click();
    await panel.locator('#comment-input').fill('작성 중인 감상');
    await page.waitForTimeout(1200);
    assert.equal(await panel.locator('#comment-input').inputValue(), '작성 중인 감상');
    assert.equal(writes.length, 1, 'repeated timeupdate events do not duplicate records');
    await page.screenshot({ path: path.join(artifacts, 'animesquad-laftel-auto.png'), fullPage: true });
    await page.evaluate(() => { history.pushState({}, '', '/player/41666/65124'); document.body.appendChild(document.createElement('span')); });
    await page.waitForTimeout(150);
    await page.evaluate(() => { document.title = '(자막) 장송의 프리렌 2화 다시보기 | 라프텔'; });
    await page.waitForTimeout(1200);
    assert.equal(writes.length, 1, 'old 80% position must not record next episode');
    assert.equal(await host.locator('iframe').count(), 0);
    await playAt(0);
    await page.locator('#details').evaluate((element) => { element.innerHTML = '<a href="/item/41666" style="display:block">(자막) 장송의 프리렌</a><h2>2화 딱히 마법이 아니어도</h2>'; });
    await page.waitForTimeout(150);
    assert.equal(await host.count(), 1, 'React title replacement remounts once');
    await host.locator('[data-action="toggle"]').click();
    await panel.locator('#current-anime-meta').getByText('라프텔 · 2화').waitFor();
    await host.locator('[data-action="close"]').click();
    await playAt(1440 * 0.8);
    await host.locator('[data-action="toggle"]').click();
    await page.waitForTimeout(1200);
    await panel.locator('#auto-record-status').getByText(/시청 기록 저장 완료/).waitFor();
    assert.equal(progress, 2);
    assert.equal(await host.locator('[data-status]').innerText(), '🟢 자동 기록 중');
    await page.evaluate(() => { history.pushState({}, '', '/item/41666'); document.title = '(자막) 장송의 프리렌'; });
    await page.waitForTimeout(150);
    assert.equal(await host.count(), 0);
    assert.equal(await page.locator('a[href="/item/41666"]').evaluate((a) => a.style.display), 'block');
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, [
      { method: 'POST', path: '/api/watch/1516/progress', payload: { progress: 1, source: 'EXTENSION' } },
      { method: 'POST', path: '/api/watch/1516/progress', payload: { progress: 2, source: 'EXTENSION' } },
    ]);
    console.log(JSON.stringify({ passed: true, writes, checked: ['compact panel/avatar/no email','paused 80% reason','live playback measurement','native video position','79% no write','80% automatic write','fixed logo text','panel outcome','comment retained','no duplicate','SPA old media blocked','closed panel refresh','React remount','non-player cleanup'], screenshot: path.join(artifacts, 'animesquad-laftel-auto.png') }));
  } finally {
    if (context) await context.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
