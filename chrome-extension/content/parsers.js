// 순수 함수만 — DOM/chrome API 참조 금지 (node --test로 테스트됨)
const ASQ_PARSERS = [
  {
    host: 'crunchyroll.com',
    // "Frieren: Beyond Journey's End - Episode 11 - A Real Hero"
    parse(title) {
      const cleaned = title
        .replace(/\s*[-–]\s*크런치롤에서 시청하세요\s*$/i, '')
        .trim();
      const epMatch = cleaned.match(/[-–]\s*Episode\s*(\d+)/i)
        ?? cleaned.match(/\s+제\s*(\d+)\s*화(?:\s|$)/);
      const ep = epMatch ? parseInt(epMatch[1]) : null;
      const animeName = epMatch ? cleaned.slice(0, epMatch.index).trim() : cleaned;
      return animeName ? { animeName, ep } : null;
    },
  },
  {
    host: 'netflix.com',
    // "Episode 11 | Frieren: Beyond Journey's End | Netflix"
    // "Frieren: Beyond Journey's End | Netflix"
    parse(title) {
      const cleaned = title.replace(/\|\s*Netflix\s*$/i, '').trim();
      const epMatch = cleaned.match(/Episode\s*(\d+)/i);
      const ep = epMatch ? parseInt(epMatch[1]) : null;
      const animeName = cleaned
        .replace(/Episode\s*\d+\s*[|]?\s*/i, '')
        .replace(/\|\s*.*$/, '')
        .trim();
      return animeName ? { animeName, ep } : null;
    },
  },
  {
    host: 'laftel.net',
    // "장송의 프리렌 11화 - 라프텔"
    parse(title) {
      const cleaned = title.replace(/[-–]\s*라프텔\s*$/i, '').trim();
      const epMatch = cleaned.match(/(\d+)화/);
      const ep = epMatch ? parseInt(epMatch[1]) : null;
      const animeName = cleaned.replace(/\s*\d+화.*$/, '').trim();
      return animeName ? { animeName, ep } : null;
    },
  },
];

function asqParseTitle(hostname, title) {
  const parser = ASQ_PARSERS.find((p) => hostname.includes(p.host));
  return parser ? parser.parse(title) : null;
}

function asqIsHost(hostname, host) {
  return hostname === host || hostname.endsWith(`.${host}`);
}

function asqParsePage(hostname, title, root) {
  if (!asqIsHost(hostname, 'netflix.com')) {
    return asqParseTitle(hostname, title);
  }

  const animeName = root
    ?.querySelector('[data-uia="evidence-overlay-season-title"]')
    ?.textContent?.trim();
  const episodeTitle = root
    ?.querySelector('[data-uia="evidence-overlay-episode-title"]')
    ?.textContent?.trim();
  const epMatch = episodeTitle?.match(/(\d+)\s*화/);

  if (animeName) {
    return { animeName, ep: epMatch ? parseInt(epMatch[1]) : null };
  }

  if (/^(?:홈\s*[-–]\s*)?(?:넷플릭스|Netflix)$/i.test(title.trim())) {
    return null;
  }

  return asqParseTitle(hostname, title);
}

function asqIsWatchPage(hostname, href) {
  if (!asqIsHost(hostname, 'netflix.com')) return true;
  const path = href.match(/^https?:\/\/[^/]+([^?#]*)/i)?.[1] ?? '';
  return path.startsWith('/watch/');
}

if (typeof module !== 'undefined') {
  module.exports = { asqParseTitle, asqParsePage, asqIsWatchPage };
}
