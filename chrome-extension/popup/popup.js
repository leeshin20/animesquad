let selectedAnime = null;   // AnimeResponse: { id, titleKorean, titleRomaji, ... }
let selectedRating = null;  // 1–5 | null
let inList = false;

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
  if (ep) $('ep-input').value = ep;

  if (results && results.length > 0) {
    await selectAnime(results[0]);
  } else {
    $('anime-label').textContent = `"${animeName}" 을(를) 찾지 못했어요. 직접 검색해주세요.`;
    $('search-section').classList.remove('hidden');
    $('search-input').value = animeName;
  }
}

async function selectAnime(anime) {
  selectedAnime = anime;
  const ep = parseInt($('ep-input').value) || null;
  $('anime-label').textContent = `${displayTitle(anime)} ${ep ? ep + '화' : ''} 기록할까요?`;

  const check = await apiFetch(`/api/watch/${anime.id}`);
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
  results.slice(0, 8).forEach((a) => {
    const li = document.createElement('li');
    li.textContent = displayTitle(a);
    li.addEventListener('click', () => {
      [...ul.children].forEach((el) => el.classList.remove('selected'));
      li.classList.add('selected');
      selectAnime(a);
    });
    ul.appendChild(li);
  });
}

// ── 별점 ──────────────────────────────────────────────────
document.querySelectorAll('.star').forEach((star) => {
  star.addEventListener('click', () => {
    selectedRating = parseInt(star.dataset.v);
    document.querySelectorAll('.star').forEach((s) => {
      s.classList.toggle('active', parseInt(s.dataset.v) <= selectedRating);
    });
  });
});

// ── 버튼 ──────────────────────────────────────────────────
$('btn-login').addEventListener('click', () => {
  chrome.tabs.create({ url: WEB_BASE });
  window.close();
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

  try {
    if (!inList) {
      const res = await apiFetch('/api/watch', {
        method: 'POST',
        body: { animeId: selectedAnime.id, status: 'WATCHING' },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
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

    await chrome.storage.local.remove('pending');
    chrome.action.setBadgeText({ text: '' });
    showView('view-done');
    setTimeout(() => window.close(), 1200);
  } catch (e) {
    alert('기록 실패: ' + e.message);
  }
});

init();
