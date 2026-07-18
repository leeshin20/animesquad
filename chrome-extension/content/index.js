let lastUrl = location.href;
let lastParsed = asqParseCurrentPage();
let episodeKey = asqEpisodeKey(lastParsed);
let notified = false;
let activeVideo = null;
let progressTracker = asqCreateProgressTracker();
let endingControlArmed = true;
let endingCheckScheduled = false;

const ASQ_MEDIA_EVENTS = [
  'timeupdate',
  'durationchange',
  'play',
  'pause',
  'seeking',
  'seeked',
  'ended',
];

function asqEpisodeKey(parsed) {
  return `${location.href}|${parsed?.animeName ?? ''}|${parsed?.ep ?? ''}`;
}

function asqParseCurrentPage() {
  return asqParsePage(location.hostname, document.title, document);
}

function resetEpisodeIfChanged() {
  const urlChanged = location.href !== lastUrl;
  if (urlChanged) {
    lastUrl = location.href;
    lastParsed = null;
  }

  const hadParsed = Boolean(lastParsed);
  const parsed = asqParseCurrentPage();
  if (parsed) lastParsed = parsed;
  const nextKey = asqEpisodeKey(lastParsed);
  if (nextKey === episodeKey) return;
  episodeKey = nextKey;
  notified = false;
  progressTracker = asqCreateProgressTracker();
  if (urlChanged || hadParsed) endingControlArmed = false;
  bindVideo(null);
}

function notifyOnce() {
  if (notified || !lastParsed || !asqIsWatchPage(location.hostname, location.href)) return;
  notified = true;
  chrome.runtime.sendMessage({ type: 'WATCHED', payload: lastParsed });
}

function onMediaEvent(event) {
  if (event.type === 'ended') {
    if (progressTracker.end()) notifyOnce();
    return;
  }
  if (event.type === 'play' || event.type === 'seeking' || event.type === 'seeked') {
    progressTracker.resetTiming();
  }
  sampleVideoProgress(activeVideo);
}

function bindVideo(video) {
  if (video === activeVideo) return;
  for (const eventName of ASQ_MEDIA_EVENTS) {
    activeVideo?.removeEventListener(eventName, onMediaEvent);
  }
  activeVideo = video;
  progressTracker.resetTiming();
  for (const eventName of ASQ_MEDIA_EVENTS) {
    activeVideo?.addEventListener(eventName, onMediaEvent);
  }
}

function checkEndingControl() {
  const endingControlVisible = Boolean(asqFindEndingControl(location.hostname, document));
  if (!endingControlVisible) {
    endingControlArmed = true;
  } else if (endingControlArmed) {
    notifyOnce();
  }
}

function sampleVideoProgress(video) {
  if (!video) return;
  if (progressTracker.tick({
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    seeking: video.seeking,
    readyState: video.readyState,
    playbackRate: video.playbackRate,
    nowMs: Date.now(),
  })) {
    notifyOnce();
  }
}

function checkVideoProgress() {
  const video = asqSelectMainVideo(document.querySelectorAll('video'));
  bindVideo(video);
  sampleVideoProgress(video);
}

const pageObserver = new MutationObserver(() => {
  if (endingCheckScheduled) return;
  endingCheckScheduled = true;
  setTimeout(() => {
    endingCheckScheduled = false;
    resetEpisodeIfChanged();
    checkEndingControl();
  }, 50);
});

pageObserver.observe(document.documentElement, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['aria-hidden', 'hidden', 'class', 'style'],
});

setInterval(() => {
  resetEpisodeIfChanged();
  checkEndingControl();
  checkVideoProgress();
}, 1000);

checkEndingControl();
checkVideoProgress();
