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

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'WATCHED' || asqShouldIgnoreWatchedMessage(msg, sender)) return;
  (async () => {
    const { animeName, ep } = msg.payload;
    const platformLink = asqLaftelSource(sender?.tab?.url);
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
    await chrome.storage.local.set({ pending });
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
