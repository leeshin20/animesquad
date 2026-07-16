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
