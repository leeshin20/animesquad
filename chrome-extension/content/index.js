let lastUrl = location.href;
let lastParsed = asqParseCurrentPage();
let episodeKey = asqEpisodeKey(lastParsed);
let notified = false;
let activeVideo = null;
let progressTracker = asqCreateProgressTracker();
let endingControlArmed = true;
let endingCheckScheduled = false;
let autoRecordResult = { status: 'waiting' };
let autoRecordInFlight = false;
let autoRecordLastAttempt = -Infinity;
let autoEpisodeArmed = true;
let autoPreviousVideo = null;
const ASQ_AUTO_RETRY_MS = 60000;

const ASQ_MEDIA_EVENTS = [
  'timeupdate',
  'durationchange',
  'loadedmetadata',
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
  autoRecordResult = { status: 'waiting' };
  autoRecordInFlight = false;
  autoRecordLastAttempt = -Infinity;
  autoEpisodeArmed = false;
  autoPreviousVideo = activeVideo ?? autoPreviousVideo;
  progressTracker = asqCreateProgressTracker();
  if (urlChanged || hadParsed) endingControlArmed = false;
  bindVideo(null);
}

function notifyOnce() {
  if (location.hostname === 'laftel.net') return;
  if (notified || !lastParsed || !asqIsWatchPage(location.hostname, location.href)) return;
  notified = true;
  asqSyncInline();
  chrome.runtime.sendMessage({ type: 'WATCHED', payload: lastParsed });
}

function onMediaEvent(event) {
  resetEpisodeIfChanged();
  if (event.type === 'loadedmetadata') autoEpisodeArmed = true;
  if (event.type === 'ended') {
    if (location.hostname === 'laftel.net') { sampleVideoProgress(activeVideo); return; }
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
  if (location.hostname === 'laftel.net') return;
  const endingControlVisible = Boolean(asqFindEndingControl(location.hostname, document));
  if (!endingControlVisible) {
    endingControlArmed = true;
  } else if (endingControlArmed) {
    notifyOnce();
  }
}

function sampleVideoProgress(video) {
  if (!video) return;
  if (location.hostname === 'laftel.net') { asqMaybeAutoRecord(video); return; }
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
    asqSyncInline();
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
  asqSyncInline();
  checkEndingControl();
  checkVideoProgress();
}, 1000);

asqSyncInline();
checkEndingControl();
checkVideoProgress();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (['LAFTEL_INLINE_SAVED', 'LAFTEL_INLINE_CLOSE'].includes(message.type)) {
    if (message.type === 'LAFTEL_INLINE_SAVED' && message.episodeUrl === location.href) {
      autoRecordResult = { status: 'saved' };
      asqSyncInline();
    }
    if (typeof asqHandleLaftelInlineAction === 'function') asqHandleLaftelInlineAction(message);
    sendResponse({ ok: true });
    return;
  }
  if (message.type === 'GET_INLINE_STATE') {
    sendResponse(asqInlineState());
    return;
  }
  if (message.type !== 'GET_CURRENT_ANIME') return;
  const path = location.href.match(/^https?:\/\/[^/]+([^?#]*)/i)?.[1] ?? '';
  let platform = null;
  if (location.hostname === 'laftel.net' && /^\/player\/[1-9]\d{0,19}\/[1-9]\d{0,19}\/?$/.test(path)) {
    platform = '라프텔';
  } else if (asqIsHost(location.hostname, 'netflix.com') && path.startsWith('/watch/')) {
    platform = '넷플릭스';
  } else if (asqIsHost(location.hostname, 'crunchyroll.com') && /^\/(?:[a-z]{2}(?:-[a-zA-Z0-9]+)?\/)?watch\//.test(path)) {
    platform = '크런치롤';
  }
  const parsed = platform ? asqParseCurrentPage() : null;
  sendResponse(parsed ? { ...parsed, platform } : null);
});


function asqInlineState() {
  if (location.hostname !== 'laftel.net'
    || !/^https:\/\/laftel\.net\/player\/[1-9]\d{0,19}\/[1-9]\d{0,19}\/?(?:[?#].*)?$/.test(location.href)) return null;
  const parsed = asqParseCurrentPage();
  if (!parsed) return null;
  return { ...parsed, episodeUrl: location.href,
    readyToRecord: notified && episodeKey === asqEpisodeKey(parsed),
    inlineAvailable: typeof asqLaftelInlineAvailable === 'function' && asqLaftelInlineAvailable(),
    autoRecordStatus: autoRecordResult.status, autoRecordMessage: autoRecordResult.message,
    autoRecordEligible: autoEpisodeArmed && episodeKey === asqEpisodeKey(parsed),
    playback: asqPlaybackSnapshot(asqSelectMainVideo(document.querySelectorAll('video'))) };
}

function asqSyncInline() {
  if (typeof asqUpdateLaftelInline === 'function') asqUpdateLaftelInline(asqInlineState());
}

function asqPlaybackSnapshot(video) {
  return video ? { currentTime: video.currentTime, duration: video.duration, paused: video.paused,
    seeking: video.seeking, readyState: video.readyState, ended: video.ended === true } : null;
}

function asqMaybeAutoRecord(video) {
  if (!autoEpisodeArmed && (video !== autoPreviousVideo || video.currentTime / video.duration < 0.8)) autoEpisodeArmed = true;
  if (!autoEpisodeArmed || !asqIsAutoRecordPosition(asqPlaybackSnapshot(video))) return;
  if (!asqInlineState() || autoRecordInFlight || autoRecordResult.status === 'saved'
    || Date.now() - autoRecordLastAttempt < ASQ_AUTO_RETRY_MS) return;
  notified = true;
  autoRecordInFlight = true;
  autoRecordLastAttempt = Date.now();
  autoRecordResult = { status: 'saving' };
  asqSyncInline();
  const key = episodeKey;
  const url = location.href;
  chrome.runtime.sendMessage({ type: 'LAFTEL_AUTO_RECORD' }).then((result) => {
    if (episodeKey !== key || location.href !== url || autoRecordResult.status === 'saved') return;
    autoRecordResult = result?.status ? result : { status: 'failed' };
  }).catch(() => {
    if (episodeKey === key && location.href === url && autoRecordResult.status !== 'saved') autoRecordResult = { status: 'failed' };
  }).finally(() => {
    if (episodeKey === key && location.href === url) { autoRecordInFlight = false; asqSyncInline(); }
  });
}
