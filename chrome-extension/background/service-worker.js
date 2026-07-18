importScripts('../shared/api.js');

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'WATCHED') return;
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
