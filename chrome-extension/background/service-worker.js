importScripts('../shared/api.js', '../content/watch-detectors.js');

function asqLaftelSource(tabUrl) {
  const match = (tabUrl ?? '').match(/^https:\/\/laftel\.net\/player\/([1-9][0-9]{0,19})\/([1-9][0-9]*)(?:\/)?(?:[?#].*)?$/);
  return match ? { platform: 'LAFTEL', platformAnimeId: match[1] } : null;
}

function asqShouldIgnoreWatchedMessage(msg, sender) {
  const tabUrl = sender?.tab?.url ?? '';
  if (/^https:\/\/laftel\.net(?:\/|$)/i.test(tabUrl) && !asqLaftelSource(tabUrl)) return true;
  const isNetflix = /^https:\/\/(?:[^/]+\.)?netflix\.com(?:\/|$)/i.test(tabUrl);
  if (!isNetflix) return false;

  const path = tabUrl.match(/^https?:\/\/[^/]+([^?#]*)/i)?.[1] ?? '';
  return !path.startsWith('/watch/')
    || asqIsInvalidNetflixTitle(msg.payload?.animeName);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LAFTEL_AUTO_RECORD') {
    if (sender?.frameId !== 0 || !/^https:\/\/laftel\.net(?:\/|$)/.test(sender.url ?? '') || !asqLaftelSource(sender.tab?.url)) {
      sendResponse({ status: 'failed' });
      return;
    }
    asqAutoRecord(sender).then(sendResponse).catch(() => sendResponse({ status: 'failed' }));
    return true;
  }
  if (['LAFTEL_INLINE_CONTEXT', 'LAFTEL_INLINE_STATUS', 'LAFTEL_INLINE_VALIDATE', 'LAFTEL_INLINE_SAVED', 'LAFTEL_INLINE_CLOSE'].includes(msg.type)) {
    if (sender?.url !== chrome.runtime.getURL('popup/index.html') + '?embedded=1'
      || !asqLaftelSource(sender?.tab?.url)) {
      sendResponse({ ok: false });
      return;
    }
    asqHandleInline(msg, sender).then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type !== 'WATCHED' || asqShouldIgnoreWatchedMessage(msg, sender)) return;
  (async () => {
    const { animeName, ep } = msg.payload;
    const platformLink = asqLaftelSource(sender?.tab?.url);
    const pending = await asqResolvePending({ animeName, ep }, platformLink);
    if (platformLink) pending.episodeUrl = sender.tab.url;
    await chrome.storage.local.set({ pending });
    if (platformLink) {
      try {
        const state = await chrome.tabs.sendMessage(sender.tab.id, { type: 'GET_INLINE_STATE' });
        if (state?.episodeUrl === pending.episodeUrl && state.inlineAvailable) return;
      } catch {
        // Keep the toolbar popup fallback if the inline control could not mount.
      }
    }
    try {
      const windowId = sender?.tab?.windowId;
      await chrome.action.openPopup(
        Number.isInteger(windowId) ? { windowId } : undefined
      );
    } catch (error) {
      console.warn('AnimeSquad 자동 팝업 열기 실패:', error);
      chrome.action.setBadgeText({ text: '●' });
      chrome.action.setBadgeBackgroundColor({ color: '#e53e3e' });
    }
  })();
});

async function asqResolvePending({ animeName, ep }, platformLink) {
  let results = [];
  let matchedByPlatform = false;
  if (platformLink) {
    try {
      const anime = await findPlatformAnime(platformLink);
      if (anime) {
        results = [anime];
        matchedByPlatform = true;
      }
    } catch {
      // Title search remains available when platform lookup is unavailable.
    }
  }
  if (!matchedByPlatform) {
    try {
      results = await searchAnime(animeName);
    } catch {
      // Keep the event so the popup can fall back to manual search.
    }
  }
  const pending = { animeName, ep, results };
  if (platformLink) Object.assign(pending, { platformLink, matchedByPlatform });
  return pending;
}

async function asqHandleInline(message, sender) {
  const state = await chrome.tabs.sendMessage(sender.tab.id, { type: 'GET_INLINE_STATE' });
  if (!state || state.episodeUrl !== sender.tab.url || asqIsInvalidNetflixTitle(state.animeName)) {
    return { ok: false };
  }
  if (message.type === 'LAFTEL_INLINE_STATUS') return { episodeUrl: state.episodeUrl, status: state.autoRecordStatus, message: state.autoRecordMessage, playback: state.playback };
  if (message.type === 'LAFTEL_INLINE_CONTEXT') {
    const pending = state.readyToRecord
      ? await asqResolvePending(state, asqLaftelSource(sender.tab.url)) : null;
    const latest = await chrome.tabs.sendMessage(sender.tab.id, { type: 'GET_INLINE_STATE' });
    if (latest?.episodeUrl !== state.episodeUrl || latest.ep !== state.ep || latest.animeName !== state.animeName) return { ok: false };
    return { episodeUrl: state.episodeUrl, current: { platform: '라프텔', animeName: state.animeName, ep: state.ep }, pending, status: state.autoRecordStatus, message: state.autoRecordMessage, playback: state.playback };
  }
  const matches = message.episodeUrl === state.episodeUrl;
  if (message.type === 'LAFTEL_INLINE_VALIDATE') return { ok: matches && state.readyToRecord === true };
  if (!matches) return { ok: false };
  await chrome.tabs.sendMessage(sender.tab.id, { type: message.type, episodeUrl: state.episodeUrl });
  if (message.type === 'LAFTEL_INLINE_SAVED') {
    const { pending } = await chrome.storage.local.get('pending');
    if (pending?.episodeUrl === state.episodeUrl) {
      await chrome.storage.local.remove('pending');
      chrome.action.setBadgeText({ text: '' });
    }
  }
  return { ok: true };
}

async function asqAutoRecord(sender) {
  const state = await chrome.tabs.sendMessage(sender.tab.id, { type: 'GET_INLINE_STATE' });
  if (state?.episodeUrl !== sender.tab.url || !state.autoRecordEligible
    || !asqIsAutoRecordPosition(state.playback ?? {})) return { status: 'failed' };
  if (!Number.isSafeInteger(state.ep) || state.ep < 1) return { status: 'needs-match', message: '회차를 확인하고 직접 기록해주세요.' };
  const me = await apiFetch('/api/me');
  if (me.status === 401 || me.status === 403) return { status: 'login-required' };
  if (!me.ok) return { status: 'failed' };
  const source = asqLaftelSource(sender.tab.url);
  const pending = await asqResolvePending(state, source);
  const anime = pending.matchedByPlatform ? pending.results[0] : asqExactAnimeMatch(pending.results, state.animeName);
  const latest = await chrome.tabs.sendMessage(sender.tab.id, { type: 'GET_INLINE_STATE' });
  if (latest?.episodeUrl !== state.episodeUrl || latest.ep !== state.ep || latest.animeName !== state.animeName
    || !latest.autoRecordEligible || !asqIsAutoRecordPosition(latest.playback ?? {})) return { status: 'failed' };
  if (!anime) {
    await asqQueueAutoPending(pending, state.episodeUrl);
    return { status: 'needs-match' };
  }
  let response;
  try {
    response = await apiFetch(`/api/watch/${anime.id}/progress`, { method: 'POST', body: { progress: state.ep, source: 'EXTENSION' } });
  } catch {
    await asqQueueAutoPending(pending, state.episodeUrl);
    return { status: 'failed' };
  }
  if (!response.ok) {
    await asqQueueAutoPending(pending, state.episodeUrl);
    return { status: response.status === 401 || response.status === 403 ? 'login-required' : 'failed' };
  }
  let message;
  if (!pending.matchedByPlatform) {
    try {
      const link = await apiFetch(`/api/anime/${anime.id}/platform-links`, { method: 'POST', body: source });
      if (!link.ok) message = '시청 기록은 저장됐지만 작품 ID 연결은 저장하지 못했어요.';
    } catch {
      message = '시청 기록은 저장됐지만 작품 ID 연결은 저장하지 못했어요.';
    }
  }
  try {
    const { pending: stored } = await chrome.storage.local.get('pending');
    if (stored?.episodeUrl === state.episodeUrl) {
      await chrome.storage.local.remove('pending');
      chrome.action.setBadgeText({ text: '' });
    }
  } catch {
    // Progress is already saved; local cleanup must not turn it into a failed write.
  }
  return { status: 'saved', message };
}

async function asqQueueAutoPending(pending, episodeUrl) {
  try {
    await chrome.storage.local.set({ pending: { ...pending, episodeUrl } });
    chrome.action.setBadgeText({ text: '●' });
  } catch {
    // The in-page panel can still resolve the current episode without stored pending data.
  }
}
