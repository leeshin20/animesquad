importScripts('../shared/api.js');

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
  if (['LAFTEL_INLINE_CONTEXT', 'LAFTEL_INLINE_VALIDATE', 'LAFTEL_INLINE_SAVED', 'LAFTEL_INLINE_CLOSE'].includes(msg.type)) {
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
  if (message.type === 'LAFTEL_INLINE_CONTEXT') {
    const pending = state.readyToRecord
      ? await asqResolvePending(state, asqLaftelSource(sender.tab.url)) : null;
    const latest = await chrome.tabs.sendMessage(sender.tab.id, { type: 'GET_INLINE_STATE' });
    if (latest?.episodeUrl !== state.episodeUrl || latest.ep !== state.ep || latest.animeName !== state.animeName) return { ok: false };
    return { episodeUrl: state.episodeUrl, current: { platform: '라프텔', animeName: state.animeName, ep: state.ep }, pending };
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
