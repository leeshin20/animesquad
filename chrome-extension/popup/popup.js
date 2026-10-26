let selectedAnime = null;   // AnimeResponse: { id, titleKorean, titleRomaji, ... }
let selectedRating = null;  // 1–5 | null
let inList = false;
let detectedAnimeName = null;
let manualMatch = false;
let selectionGeneration = 0;
let platformLink = null;
let matchedByPlatform = false;
const embedded = typeof location !== 'undefined' && location.search === '?embedded=1';
let inlineEpisodeUrl = null;

const $ = (id) => document.getElementById(id);

function showView(id) {
  ['view-login', 'view-empty', 'view-record', 'view-done'].forEach((v) => {
    $(v).classList.toggle('hidden', v !== id);
  });
}

function displayTitle(anime) {
  return anime.titleKorean || anime.titleRomaji || anime.titleEnglish;
}

// ── 초기화 ────────────────────────────────────────────────
async function init() {
  let me;
  let account;
  try {
    me = await apiFetch('/api/me');
    if (me.ok) account = await me.json();
  } catch {
    showView('view-login');
    return;
  }
  if (!me.ok) {
    showView('view-login');
    return;
  }

  $('account-name').textContent = account.displayName || 'AnimeSquad 사용자';
  $('account-email').textContent = account.email || '';
  $('session-panel').classList.remove('hidden');
  let pending;
  if (embedded) {
    document.body.classList.add('embedded');
    $('btn-dismiss').textContent = '닫기';
    $('empty-heading').textContent = '80%에 도달하면 자동으로 기록해요';
    $('empty-hint').textContent = '작품이 연결되어 있으면 별도 클릭 없이 해당 회차를 시청 기록에 반영해요.';
    try {
      const context = await chrome.runtime.sendMessage({ type: 'LAFTEL_INLINE_CONTEXT' });
      if (!context?.episodeUrl) throw new Error('No current episode');
      inlineEpisodeUrl = context.episodeUrl;
      renderAutoRecordStatus(context);
      setInterval(refreshInlineStatus, 1000);
      renderCurrentAnime(context.current);
      pending = context.pending;
    } catch {
      $('current-anime-title').textContent = '재생 정보를 다시 확인해주세요';
      $('current-anime-meta').textContent = '회차가 변경됐다면 패널을 닫고 다시 열어주세요.';
      showView('view-empty');
      return;
    }
  } else {
    await loadCurrentAnime();
    ({ pending } = await chrome.storage.local.get('pending'));
  }
  if (!pending) {
    showView('view-empty');
    return;
  }
  if (asqIsInvalidNetflixTitle(pending?.animeName)) {
    if (!embedded) await chrome.storage.local.remove('pending');
    showView('view-empty');
    return;
  }

  showView('view-record');
  loadRecord(pending);
}

async function loadCurrentAnime() {
  let current = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      current = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_ANIME' });
    }
  } catch {
    // 콘텐츠 스크립트가 없는 탭에서는 감지 대기 안내를 유지한다.
  }
  renderCurrentAnime(current);
}

function renderCurrentAnime(current) {
  const detected = current && !asqIsInvalidNetflixTitle(current.animeName);
  $('current-anime-title').textContent = detected ? current.animeName : '감지된 작품이 없어요';
  $('current-anime-meta').textContent = detected
    ? `${current.platform} · ${current.ep ? current.ep + '화' : '회차 확인 중'}`
    : '지원하는 스트리밍 사이트의 재생 탭에서 확인해주세요.';
}


async function loadRecord({ animeName, ep, results, platformLink: source, matchedByPlatform: resolved }) {
  platformLink = source ?? null;
  matchedByPlatform = resolved === true;
  detectedAnimeName = animeName;
  if (ep) $('ep-input').value = ep;

  const suggestion = platformLink && !matchedByPlatform
    ? asqExactAnimeMatch(results ?? [], animeName)
    : results?.[0];
  if (suggestion) {
    await selectAnime(suggestion);
    $('btn-change-anime').classList.remove('hidden');
  } else {
    $('anime-label').textContent = `"${animeName}" 을(를) 찾지 못했어요. 직접 검색해주세요.`;
    $('search-section').classList.remove('hidden');
    $('search-input').value = animeName;
    if (platformLink && results?.length) {
      $('anime-label').textContent = '자동으로 연결할 작품을 확정하지 못했어요. 검색 결과에서 선택해주세요.';
      renderResults(results);
    }
  }
}

async function selectAnime(anime) {
  const generation = ++selectionGeneration;
  selectedAnime = anime;
  const ep = parseInt($('ep-input').value) || null;
  $('anime-label').textContent = `${displayTitle(anime)} ${ep ? ep + '화' : ''} 기록할까요?`;

  const check = await apiFetch(`/api/watch/${anime.id}`);
  if (generation !== selectionGeneration) return;
  inList = check.ok;
  $('watchlist-warning').classList.toggle('hidden', inList);
}

// ── 검색 (매칭 실패 시) ───────────────────────────────────
let debounceTimer;
$('search-input').addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const q = $('search-input').value.trim();
    if (!q) return;
    renderResults(await searchAnime(q));
  }, 300);
});

function renderResults(results) {
  const ul = $('search-results');
  ul.innerHTML = '';
  const resultButtons = [];
  results.slice(0, 8).forEach((a) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.classList.add('result-button');
    button.setAttribute('type', 'button');
    button.setAttribute('aria-pressed', 'false');
    button.textContent = displayTitle(a);
    const selectResult = async () => {
      [...ul.children].forEach((el) => {
        el.classList.remove('selected');
      });
      resultButtons.forEach((resultButton) => resultButton.setAttribute('aria-pressed', 'false'));
      li.classList.add('selected');
      button.setAttribute('aria-pressed', 'true');
      manualMatch = true;
      await selectAnime(a);
    };
    button.addEventListener('click', selectResult);
    resultButtons.push(button);
    li.appendChild(button);
    ul.appendChild(li);
  });
}

// ── 별점 ──────────────────────────────────────────────────
const ratingStars = [...document.querySelectorAll('.star')];

function setRating(value, { focus = false } = {}) {
  selectedRating = Math.min(5, Math.max(1, value));
  ratingStars.forEach((star) => {
    const starValue = parseInt(star.dataset.v);
    const selected = starValue === selectedRating;
    star.classList.toggle('active', starValue <= selectedRating);
    star.setAttribute('aria-checked', selected ? 'true' : 'false');
    star.tabIndex = selected ? 0 : -1;
    if (selected && focus) star.focus();
  });
}

ratingStars.forEach((star, index) => {
  star.tabIndex = index === 0 ? 0 : -1;
  star.addEventListener('click', () => {
    setRating(parseInt(star.dataset.v));
  });
  star.addEventListener('keydown', (event) => {
    const movement = {
      ArrowLeft: -1,
      ArrowUp: -1,
      ArrowRight: 1,
      ArrowDown: 1,
    }[event.key];
    if (!movement) return;

    event.preventDefault();
    const current = selectedRating || index + 1;
    const next = ((current - 1 + movement + ratingStars.length) % ratingStars.length) + 1;
    setRating(next, { focus: true });
  });
});

async function learnAliasIfNeeded(animeId, wasManualMatch) {
  if (!wasManualMatch || !detectedAnimeName) return true;
  try {
    const response = await apiFetch(`/api/anime/${animeId}/aliases`, {
      method: 'POST',
      body: { alias: detectedAnimeName },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function learnPlatformLinkIfNeeded(animeId, wasManualMatch) {
  if (!platformLink || (matchedByPlatform && !wasManualMatch)) return 'saved';
  try {
    const response = await apiFetch(`/api/anime/${animeId}/platform-links`, {
      method: 'POST',
      body: platformLink,
    });
    if (response.status === 409) return 'conflict';
    return response.ok ? 'saved' : 'failed';
  } catch {
    return 'failed';
  }
}

// ── 버튼 ──────────────────────────────────────────────────
$('btn-login').addEventListener('click', () => {
  chrome.tabs.create({ url: WEB_BASE });
  closePopup();
});

$('btn-change-anime').addEventListener('click', async () => {
  $('search-section').classList.remove('hidden');
  $('search-input').value = detectedAnimeName || '';
  const query = $('search-input').value.trim();
  if (query) renderResults(await searchAnime(query));
});

$('btn-dismiss').addEventListener('click', async () => {
  if (embedded) { await closePopup(); return; }
  await chrome.storage.local.remove('pending');
  chrome.action.setBadgeText({ text: '' });
  window.close();
});

$('btn-record').addEventListener('click', async () => {
  if (!selectedAnime) { alert('애니를 선택해주세요.'); return; }
  const animeId = selectedAnime.id;
  const wasManualMatch = manualMatch;

  const ep = parseInt($('ep-input').value);
  if (!ep || ep < 1) { alert('화수를 입력해주세요.'); return; }

  const comment = $('comment-input').value.trim();
  const recordButton = $('btn-record');
  const recordStatus = $('record-status');
  recordButton.disabled = true;
  recordButton.textContent = '기록 중...';
  recordStatus.classList.add('hidden');
  recordStatus.textContent = '';

  try {
    if (embedded) {
      const validation = await chrome.runtime.sendMessage({ type: 'LAFTEL_INLINE_VALIDATE', episodeUrl: inlineEpisodeUrl });
      if (!validation?.ok) throw new Error('회차가 변경됐어요. 패널을 다시 열어주세요');
    }
    if (!inList) {
      const res = await apiFetch('/api/watch', {
        method: 'POST',
        body: { animeId, status: 'WATCHING' },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      inList = true;
    }

    if (selectedRating != null || comment) {
      const res = await apiFetch(`/api/watch/${animeId}/episodes/${ep}`, {
        method: 'PUT',
        body: { score: selectedRating, comment: comment || null },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
    } else {
      const res = await apiFetch(`/api/watch/${animeId}`, {
        method: 'PATCH',
        body: { progress: ep },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
    }

    const linkLearned = await learnPlatformLinkIfNeeded(animeId, wasManualMatch);
    const aliasLearned = linkLearned === 'conflict'
      ? true : await learnAliasIfNeeded(animeId, wasManualMatch);
    if (embedded) {
      try {
        await chrome.runtime.sendMessage({ type: 'LAFTEL_INLINE_SAVED', episodeUrl: inlineEpisodeUrl });
      } catch {
        // The viewing record already succeeded; a detached page must not offer a retry.
      }
    } else {
      await chrome.storage.local.remove('pending');
      chrome.action.setBadgeText({ text: '' });
    }
    if (linkLearned === 'conflict') {
      alert('기록은 완료됐지만 이 라프텔 작품은 이미 다른 작품에 연결되어 있어 연결을 변경하지 않았어요.');
    } else if (linkLearned === 'failed') {
      alert('기록은 완료됐지만 작품 ID 연결 저장에 실패했어요.');
    } else if (!aliasLearned) {
      alert('기록은 완료됐지만 별칭 저장에 실패했어요.');
    }
    showView('view-done');
    if (!embedded) setTimeout(() => window.close(), 1200);
  } catch (e) {
    recordStatus.textContent = `기록 실패 (${e.message}). 다시 시도해주세요.`;
    recordStatus.classList.remove('hidden');
  } finally {
    recordButton.disabled = false;
    recordButton.textContent = '기록하기';
  }
});

function renderAutoRecordStatus(result) {
  const labels = {
    waiting: '전체 재생 시간의 80%에 도달하면 자동으로 기록해요.',
    saving: '시청 기록을 자동 저장하고 있어요.',
    saved: '시청 기록을 저장했어요. 별점과 한줄평도 남길 수 있어요.',
    'needs-match': '작품을 자동으로 연결하지 못했어요. 아래에서 선택해 기록해주세요.',
    'login-required': '자동 기록하려면 AnimeSquad에 다시 로그인해주세요.',
    failed: '자동 기록에 실패했어요. 1분 후 재시도하거나 아래에서 직접 기록해주세요.',
  };
  $('auto-record-status').textContent = result.message || labels[result.status] || labels.waiting;
  $('auto-record-status').classList.remove('hidden');
}

async function refreshInlineStatus() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'LAFTEL_INLINE_STATUS' });
    if (result?.episodeUrl === inlineEpisodeUrl) renderAutoRecordStatus(result);
  } catch {
    // Navigation may detach the frame; retain the last known outcome.
  }
}

async function closePopup() {
  if (embedded) {
    if (inlineEpisodeUrl) await chrome.runtime.sendMessage({ type: 'LAFTEL_INLINE_CLOSE', episodeUrl: inlineEpisodeUrl });
  } else {
    window.close();
  }
}

init();
