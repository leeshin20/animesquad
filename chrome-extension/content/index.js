let lastUrl = location.href;
let lastParsed = asqParseTitle(location.hostname, document.title);
let episodeKey = asqEpisodeKey(lastParsed);
let notified = false;
let activeVideo = null;
let progressTracker = asqCreateProgressTracker();

function asqEpisodeKey(parsed) {
  return `${location.href}|${parsed?.animeName ?? ''}|${parsed?.ep ?? ''}`;
}

function resetEpisodeIfChanged() {
  const parsed = asqParseTitle(location.hostname, document.title);
  const nextKey = asqEpisodeKey(parsed);
  if (nextKey === episodeKey) return;
  episodeKey = nextKey;
  lastParsed = parsed;
  notified = false;
  progressTracker = asqCreateProgressTracker();
  bindVideo(null);
}

function notifyOnce() {
  if (notified || !lastParsed) return;
  notified = true;
  chrome.runtime.sendMessage({ type: 'WATCHED', payload: lastParsed });
}

function onVideoEnded() {
  if (progressTracker.end()) notifyOnce();
}

function bindVideo(video) {
  if (video === activeVideo) return;
  activeVideo?.removeEventListener('ended', onVideoEnded);
  activeVideo = video;
  activeVideo?.addEventListener('ended', onVideoEnded);
  progressTracker.reset();
}

function checkEndingControl() {
  if (asqFindEndingControl(location.hostname, document)) notifyOnce();
}

function checkVideoProgress() {
  const video = asqSelectMainVideo(document.querySelectorAll('video'));
  bindVideo(video);
  if (!video) return;
  if (progressTracker.tick({
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    seeking: video.seeking,
    readyState: video.readyState,
    nowMs: Date.now(),
  })) {
    notifyOnce();
  }
}

const pageObserver = new MutationObserver(() => {
  resetEpisodeIfChanged();
  checkEndingControl();
});

pageObserver.observe(document.documentElement, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['aria-hidden', 'hidden', 'class', 'style'],
});

setInterval(() => {
  if (location.href !== lastUrl) lastUrl = location.href;
  resetEpisodeIfChanged();
  checkEndingControl();
  checkVideoProgress();
}, 1000);

checkEndingControl();
checkVideoProgress();
