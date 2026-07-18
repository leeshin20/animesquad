importScripts('../shared/api.js');

function asqShouldIgnoreWatchedMessage(msg, sender) {
  const tabUrl = sender?.tab?.url ?? '';
  const isNetflix = /^https:\/\/(?:[^/]+\.)?netflix\.com(?:\/|$)/i.test(tabUrl);
  if (!isNetflix) return false;

  const path = tabUrl.match(/^https?:\/\/[^/]+([^?#]*)/i)?.[1] ?? '';
  return !path.startsWith('/watch/')
    || asqIsInvalidNetflixTitle(msg.payload?.animeName);
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'WATCHED' || asqShouldIgnoreWatchedMessage(msg, sender)) return;
  (async () => {
    const { animeName, ep } = msg.payload;
    let results = [];
    try {
      results = await searchAnime(animeName);
    } catch {
      // Keep the watched event so the popup can fall back to manual search.
    }
    await chrome.storage.local.set({ pending: { animeName, ep, results } });
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
