let selectedAnime = null;   // AnimeResponse: { id, titleKorean, titleRomaji, ... }
let selectedRating = null;  // 1–5 | null
let inList = false;
let detectedAnimeName = null;
let manualMatch = false;
let selectionGeneration = 0;

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
  try {
    me = await apiFetch('/api/me');
  } catch {
    showView('view-login');
    return;
  }
  if (!me.ok) {
    showView('view-login');
    return;
  }

  const { pending } = await chrome.storage.local.get('pending');
  if (!pending) {
    showView('view-empty');
    return;
  }

  showView('view-record');
  loadRecord(pending);
}

async function loadRecord({ animeName, ep, results }) {
  detectedAnimeName = animeName;
  if (ep) $('ep-input').value = ep;

  if (results && results.length > 0) {
    await selectAnime(results[0]);
    $('btn-change-anime').classList.remove('hidden');
  } else {
    $('anime-label').textContent = `"${animeName}" 을(를) 찾지 못했어요. 직접 검색해주세요.`;
    $('search-section').classList.remove('hidden');
    $('search-input').value = animeName;
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

async function learnAliasIfNeeded() {
  if (!manualMatch || !detectedAnimeName) return true;
  try {
    const response = await apiFetch(`/api/anime/${selectedAnime.id}/aliases`, {
      method: 'POST',
      body: { alias: detectedAnimeName },
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ── 버튼 ──────────────────────────────────────────────────
$('btn-login').addEventListener('click', () => {
  chrome.tabs.create({ url: WEB_BASE });
  window.close();
});

$('btn-change-anime').addEventListener('click', async () => {
  $('search-section').classList.remove('hidden');
  $('search-input').value = detectedAnimeName || '';
  const query = $('search-input').value.trim();
  if (query) renderResults(await searchAnime(query));
});

$('btn-dismiss').addEventListener('click', async () => {
  await chrome.storage.local.remove('pending');
  chrome.action.setBadgeText({ text: '' });
  window.close();
});

$('btn-record').addEventListener('click', async () => {
  if (!selectedAnime) { alert('애니를 선택해주세요.'); return; }

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
    if (!inList) {
      const res = await apiFetch('/api/watch', {
        method: 'POST',
        body: { animeId: selectedAnime.id, status: 'WATCHING' },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      inList = true;
    }

    if (selectedRating != null || comment) {
      const res = await apiFetch(`/api/watch/${selectedAnime.id}/episodes/${ep}`, {
        method: 'PUT',
        body: { score: selectedRating, comment: comment || null },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
    } else {
      const res = await apiFetch(`/api/watch/${selectedAnime.id}`, {
        method: 'PATCH',
        body: { progress: ep },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
    }

    const aliasLearned = await learnAliasIfNeeded();
    await chrome.storage.local.remove('pending');
    chrome.action.setBadgeText({ text: '' });
    if (!aliasLearned) {
      alert('기록은 완료됐지만 별칭 저장에 실패했어요.');
    }
    showView('view-done');
    setTimeout(() => window.close(), 1200);
  } catch (e) {
    recordStatus.textContent = `기록 실패 (${e.message}). 다시 시도해주세요.`;
    recordStatus.classList.remove('hidden');
  } finally {
    recordButton.disabled = false;
    recordButton.textContent = '기록하기';
  }
});

init();
