const ASQ_MIN_VIDEO_SECONDS = 300;
const ASQ_PROGRESS_THRESHOLD = 0.9;
const ASQ_REQUIRED_PLAY_SECONDS = 30;

const ASQ_ENDING_LABELS = [
  {
    host: 'crunchyroll.com',
    labels: ['skip credits', '크레딧 건너뛰기', '엔딩 건너뛰기'],
  },
  {
    host: 'netflix.com',
    labels: ['skip credits', 'next episode', '크레딧 건너뛰기', '다음 화', '다음화'],
  },
  {
    host: 'laftel.net',
    labels: ['엔딩 건너뛰기', '크레딧 건너뛰기', '다음 화', '다음화'],
  },
];

function asqIsVisible(element, getStyle) {
  if (!element || element.hidden || element.getAttribute?.('aria-hidden') === 'true') return false;
  const style = getStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function asqFindEndingControl(hostname, root, getStyle = getComputedStyle) {
  const rule = ASQ_ENDING_LABELS.find((candidate) => (
    hostname === candidate.host || hostname.endsWith(`.${candidate.host}`)
  ));
  if (!rule) return null;

  const controls = root.querySelectorAll('button, [role="button"], [aria-label]');
  return Array.from(controls).find((control) => {
    const label = `${control.getAttribute?.('aria-label') ?? ''} ${control.textContent ?? ''}`
      .trim()
      .toLowerCase();
    return rule.labels.some((candidate) => label.includes(candidate))
      && asqIsVisible(control, getStyle);
  }) ?? null;
}

function asqSelectMainVideo(videos, getStyle = getComputedStyle) {
  return Array.from(videos)
    .filter((video) => Number.isFinite(video.duration) && video.duration >= ASQ_MIN_VIDEO_SECONDS)
    .filter((video) => asqIsVisible(video, getStyle))
    .map((video) => {
      const rect = video.getBoundingClientRect();
      return { video, area: rect.width * rect.height };
    })
    .sort((left, right) => right.area - left.area)[0]?.video ?? null;
}

function asqCreateProgressTracker() {
  let playedSeconds = 0;
  let lastTickAt = null;
  let completed = false;

  function reset() {
    playedSeconds = 0;
    lastTickAt = null;
    completed = false;
  }

  function tick({ currentTime, duration, paused, seeking, readyState, nowMs }) {
    const eligible = Number.isFinite(duration)
      && duration >= ASQ_MIN_VIDEO_SECONDS
      && currentTime / duration >= ASQ_PROGRESS_THRESHOLD;

    if (!eligible) {
      playedSeconds = 0;
      lastTickAt = nowMs;
      return false;
    }
    if (completed) return false;
    if (paused || seeking || readyState < 3) {
      lastTickAt = nowMs;
      return false;
    }
    if (lastTickAt !== null) {
      playedSeconds += Math.min(Math.max((nowMs - lastTickAt) / 1000, 0), 2);
    }
    lastTickAt = nowMs;
    if (playedSeconds < ASQ_REQUIRED_PLAY_SECONDS) return false;
    completed = true;
    return true;
  }

  function end() {
    if (completed) return false;
    completed = true;
    return true;
  }

  return {
    tick,
    end,
    reset,
    snapshot: () => ({ playedSeconds, completed }),
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    asqFindEndingControl,
    asqSelectMainVideo,
    asqCreateProgressTracker,
  };
}
