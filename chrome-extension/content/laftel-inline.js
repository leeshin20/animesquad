let asqInlineHost = null;
let asqInlineAnchor = null;
let asqInlineOriginalDisplay = null;
let asqInlineCurrent = null;
let asqInlineSavedUrl = null;

function asqDisposeLaftelInline() {
  asqInlineHost?.remove();
  if (asqInlineAnchor && asqInlineOriginalDisplay) {
    const { value, priority } = asqInlineOriginalDisplay;
    if (value) asqInlineAnchor.style.setProperty('display', value, priority);
    else asqInlineAnchor.style.removeProperty('display');
  }
  asqInlineHost = null;
  asqInlineAnchor = null;
  asqInlineOriginalDisplay = null;
}

function asqLaftelInlineAvailable() {
  return Boolean(asqInlineHost?.isConnected);
}

function asqUpdateLaftelInline(state) {
  const previous = asqInlineCurrent;
  asqInlineCurrent = state;
  if (!state) {
    asqDisposeLaftelInline();
    asqInlineSavedUrl = null;
    return;
  }
  if (previous?.episodeUrl !== state.episodeUrl) {
    asqDisposeLaftelInline();
    asqInlineSavedUrl = null;
  }
  const workId = state.episodeUrl.match(/\/player\/([1-9]\d*)\//)?.[1];
  const anchor = document.querySelector(`a[href="/item/${workId}"]`)
    ?? document.querySelector(`a[href="https://laftel.net/item/${workId}"]`);
  if (!anchor) {
    asqDisposeLaftelInline();
    return;
  }
  if (!asqLaftelInlineAvailable() || anchor !== asqInlineAnchor) {
    asqDisposeLaftelInline();
    asqInlineAnchor = anchor;
    asqInlineOriginalDisplay = { value: anchor.style.getPropertyValue('display'), priority: anchor.style.getPropertyPriority('display') };
    anchor.style.setProperty('display', 'inline-flex');
    asqInlineHost = document.createElement('span');
    asqInlineHost.id = 'animesquad-inline';
    const shadow = asqInlineHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; display: inline-block; vertical-align: middle; margin-left: 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        * { box-sizing: border-box; }
        button { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #BBF7D0; border-radius: 999px; padding: 5px 10px; background: #F0FDF4; color: #15803D; font: 600 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; cursor: pointer; white-space: nowrap; }
        button:hover { background: #DCFCE7; }
        button:focus-visible { outline: 2px solid #15803D; outline-offset: 3px; }
        img { width: 20px; height: 20px; }
        .panel { position: fixed; width: 322px; max-width: calc(100vw - 24px); z-index: 2147483647; border: 1px solid #E5E5E5; border-radius: 14px; background: white; box-shadow: 0 10px 36px #0003; overflow: hidden; }
        .panel[hidden] { display: none; }
        header { display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 12px; border-bottom: 1px solid #F5F5F5; color: #525252; font-size: 12px; }
        header button { border: 0; padding: 4px 8px; background: transparent; color: #525252; }
        iframe { display: block; width: 100%; border: 0; background: white; }
      </style>
      <button type="button" data-action="toggle" aria-expanded="false" aria-controls="record-panel"><img alt="" /><span data-status>시청 중</span></button>
      <div id="record-panel" class="panel" hidden role="region" aria-label="AnimeSquad 기록 패널">
        <header><span>시청 기록</span><button type="button" data-action="close">닫기</button></header>
      </div>`;
    shadow.querySelector('img').src = chrome.runtime.getURL('assets/logo-mark.svg');
    shadow.querySelector('[data-action="toggle"]').addEventListener('click', asqToggleLaftelPanel);
    shadow.querySelector('[data-action="close"]').addEventListener('click', asqCloseLaftelPanel);
    anchor.after(asqInlineHost);
  }
  const shadow = asqInlineHost.shadowRoot;
  const label = asqInlineSavedUrl === state.episodeUrl ? '기록 완료' : state.readyToRecord ? '기록하기' : '시청 중';
  const status = shadow.querySelector('[data-status]');
  if (status.textContent !== label) status.textContent = label;
  const button = shadow.querySelector('[data-action="toggle"]');
  const description = `AnimeSquad ${label}`;
  if (button.getAttribute('aria-label') !== description) button.setAttribute('aria-label', description);
  if (previous && previous.readyToRecord !== state.readyToRecord && !shadow.querySelector('.panel').hidden) {
    const frame = shadow.querySelector('iframe');
    if (frame) frame.src = chrome.runtime.getURL('popup/index.html') + '?embedded=1';
  }
}

function asqToggleLaftelPanel() {
  const shadow = asqInlineHost.shadowRoot;
  const panel = shadow.querySelector('.panel');
  if (!panel.hidden) { asqCloseLaftelPanel(); return; }
  if (!shadow.querySelector('iframe')) {
    const frame = document.createElement('iframe');
    frame.title = 'AnimeSquad 시청 기록';
    frame.src = chrome.runtime.getURL('popup/index.html') + '?embedded=1';
    panel.appendChild(frame);
  }
  const rect = asqInlineHost.getBoundingClientRect();
  const below = innerHeight - rect.bottom - 12;
  const height = Math.min(620, below >= 300 ? below : innerHeight - 24);
  panel.style.left = Math.max(12, Math.min(rect.left, innerWidth - 334)) + 'px';
  panel.style.top = (below >= 300 ? rect.bottom + 8 : Math.max(12, rect.top - height - 8)) + 'px';
  shadow.querySelector('iframe').style.height = Math.max(160, height - 42) + 'px';
  panel.hidden = false;
  shadow.querySelector('[data-action="toggle"]').setAttribute('aria-expanded', 'true');
}

function asqCloseLaftelPanel() {
  const shadow = asqInlineHost?.shadowRoot;
  if (!shadow) return;
  shadow.querySelector('.panel').hidden = true;
  const button = shadow.querySelector('[data-action="toggle"]');
  button.setAttribute('aria-expanded', 'false');
  button.focus();
}

function asqHandleLaftelInlineAction(message) {
  if (message.episodeUrl !== asqInlineCurrent?.episodeUrl) return;
  if (message.type === 'LAFTEL_INLINE_CLOSE') asqCloseLaftelPanel();
  if (message.type === 'LAFTEL_INLINE_SAVED') {
    asqInlineSavedUrl = message.episodeUrl;
    asqUpdateLaftelInline(asqInlineCurrent);
  }
}
