// 순수 함수만 — DOM/chrome API 참조 금지 (node --test로 테스트됨)
const ASQ_PARSERS = [
  {
    host: 'crunchyroll.com',
    // "Frieren: Beyond Journey's End - Episode 11 - A Real Hero"
    parse(title) {
      const epMatch = title.match(/[-–]\s*Episode\s*(\d+)/i);
      const ep = epMatch ? parseInt(epMatch[1]) : null;
      const animeName = title.split(/[-–]\s*Episode/i)[0].trim();
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

if (typeof module !== 'undefined') {
  module.exports = { asqParseTitle };
}
