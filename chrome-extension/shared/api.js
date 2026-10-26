// popup(<script>)과 service worker(importScripts) 양쪽에서 로드되는 plain script
const API_BASE = 'https://api.animesquad.me';
const WEB_BASE = 'https://animesquad.me';

function asqIsInvalidNetflixTitle(animeName) {
  if (typeof animeName !== 'string') return true;
  const normalized = animeName?.trim() ?? '';
  return normalized === ''
    || /^(?:홈\s*[-–]\s*)?(?:넷플릭스|Netflix)$/i.test(normalized);
}

async function apiFetch(path, { method = 'GET', body } = {}) {
  return fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
}

async function searchAnime(query) {
  const res = await apiFetch(`/api/anime/search?q=${encodeURIComponent(query)}`);
  return res.ok ? res.json() : [];
}

async function findPlatformAnime({ platform, platformAnimeId }) {
  const res = await apiFetch(`/api/anime/platform-links/${encodeURIComponent(platform)}/${encodeURIComponent(platformAnimeId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
