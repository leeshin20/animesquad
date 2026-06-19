const STATUS: Record<string, string> = {
  FINISHED: "완결",
  RELEASING: "방영 중",
  NOT_YET_RELEASED: "방영 전",
  CANCELLED: "중단",
  HIATUS: "휴재",
};

const FORMAT: Record<string, string> = {
  TV: "TV",
  TV_SHORT: "TV 단편",
  MOVIE: "극장판",
  SPECIAL: "스페셜",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "뮤직",
  ONE_SHOT: "단편",
};

export function aniStatus(s: string | null | undefined): string {
  if (!s) return "-";
  return STATUS[s] ?? s;
}

export function aniFormat(f: string | null | undefined): string {
  if (!f) return "-";
  return FORMAT[f] ?? f;
}
