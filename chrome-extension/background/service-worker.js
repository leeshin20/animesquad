importScripts('../shared/api.js');

chrome.runtime.onMessage.addListener((msg) => {
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
      await chrome.action.openPopup();
    } catch {
      chrome.action.setBadgeText({ text: '●' });
      chrome.action.setBadgeBackgroundColor({ color: '#e53e3e' });
    }
  })();
});
