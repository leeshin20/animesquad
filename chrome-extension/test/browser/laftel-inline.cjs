// Run with Playwright and an extension-capable Chromium; API writes stay on a disposable local server.
const { chromium } = require(process.env.ASQ_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const artifacts = process.env.ASQ_ARTIFACT_DIR || os.tmpdir();
(async () => {
  let context;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asq-inline-test-'));
  let failRecord = true;
  const writes = [];
  const server = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method !== 'GET') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      writes.push({ method: req.method, path: req.url, payload });
      if (req.url === '/api/watch/1516' && failRecord) { res.statusCode = 503; res.end('{}'); return; }
    }
    const value = req.url === '/api/me' ? { displayName: '프리렌팬', email: 'frieren@example.com' }
      : req.url.includes('/platform-links/') ? { id: 1516, titleKorean: '장송의 프리렌' }
      : req.url.includes('/search') ? [] : { progress: 0 };
    res.end(JSON.stringify(value));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
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
    await context.route('https://laftel.net/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="UTF-8"><title>(자막) 장송의 프리렌 1화 다시보기 | 라프텔</title><style>body{font-family:sans-serif;margin:24px}video{width:100%;height:280px;background:#111}a{color:#555}#details{padding:16px 0}h2{font-size:19px}</style></head><body><h2>LAFTEL</h2><video></video><div id="details"><a href="/item/41666" style="display:block">(자막) 장송의 프리렌</a><h2>1화 모험의 끝</h2></div><p>회차 설명</p></body></html>` }));
    await context.route('https://api.animesquad.me/**', (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('https://laftel.net/player/41666/65123');
    await page.waitForTimeout(200);
    const host = page.locator('#animesquad-inline');
    assert.equal(await host.count(), 1, 'logo control mounts next to title');
    await host.locator('button[data-action="toggle"]').click();
    const panel = page.frameLocator('#animesquad-inline iframe');
    await panel.locator('#account-name').getByText('프리렌팬').waitFor();
    assert.equal(await panel.locator('#view-empty').isVisible(), true);
    assert.equal(await panel.locator('#current-anime-meta').innerText(), '라프텔 · 1화');
    assert.equal(writes.length, 0);
    await page.evaluate(() => { const button = document.createElement('button'); button.id = 'ending'; button.textContent = '엔딩 스킵'; document.body.appendChild(button); });
    await panel.locator('#view-record').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(artifacts, 'animesquad-laftel-inline-form.png'), fullPage: true });
    await panel.locator('#btn-record').click();
    await panel.locator('#record-status').waitFor({ state: 'visible' });
    assert.match(await host.locator('[data-status]').innerText(), /기록하기/);
    failRecord = false;
    await panel.locator('#btn-record').click();
    await panel.locator('#view-done').waitFor({ state: 'visible' });
    assert.equal(await host.locator('[data-status]').innerText(), '기록 완료');
    await page.screenshot({ path: path.join(artifacts, 'animesquad-laftel-inline.png'), fullPage: true });
    await page.evaluate(() => {
      document.getElementById('ending').remove();
      history.pushState({}, '', '/player/41666/65124');
      document.title = '(자막) 장송의 프리렌 2화 다시보기 | 라프텔';
    });
    await page.waitForTimeout(150);
    assert.equal(await host.locator('[data-status]').innerText(), '시청 중');
    assert.equal(await host.locator('iframe').count(), 0, 'stale frame is removed');
    await page.locator('#details').evaluate((element) => { element.innerHTML = '<a href="/item/41666" style="display:block">(자막) 장송의 프리렌</a><h2>2화 딱히 마법이 아니어도</h2>'; });
    await page.waitForTimeout(150);
    assert.equal(await host.count(), 1, 'React replacement remounts once');
    await host.locator('button[data-action="toggle"]').click();
    await panel.locator('#current-anime-meta').getByText('라프텔 · 2화').waitFor();
    assert.equal(await panel.locator('#view-empty').isVisible(), true);
    await page.evaluate(() => { history.pushState({}, '', '/item/41666'); document.title = '(자막) 장송의 프리렌'; });
    await page.waitForTimeout(150);
    assert.equal(await host.count(), 0, 'non-player navigation removes inline UI');
    assert.equal(await page.locator('a[href="/item/41666"]').evaluate((a) => a.style.display), 'block');
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, [
      { method: 'PATCH', path: '/api/watch/1516', payload: { progress: 1 } },
      { method: 'PATCH', path: '/api/watch/1516', payload: { progress: 1 } },
    ]);
    console.log(JSON.stringify({ passed: true, writes, checked: ['real extension iframe APIs and sender identity','account/current episode','pre-ending no write','inline ending refresh','failed write retry','saved status','SPA frame reset','React remount','non-player removal'], screenshot: path.join(artifacts, 'animesquad-laftel-inline.png') }));
  } finally {
    if (context) await context.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
