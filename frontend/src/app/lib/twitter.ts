export function scoreToStars(score: number): string {
  return "★".repeat(score) + "☆".repeat(5 - score);
}

export function buildEpisodeTweetText(
  title: string,
  ep: number,
  score: number | null,
  comment: string,
): string {
  if (score == null && comment.trim() === "") {
    return `${title} ${ep}화를 감상했습니다`;
  }
  const stars = score != null ? ` ${scoreToStars(score)}` : "";
  const body = comment.trim() ? ` ${comment.trim()}` : "";
  return `${title} ${ep}화${stars}${body}`;
}

export function buildSeriesTweetText(
  title: string,
  statusLabel: string,
  score: number | null,
  comment: string,
): string {
  const stars = score != null ? ` ${scoreToStars(score)}` : "";
  const body = comment.trim() ? ` ${comment.trim()}` : "";
  return `[${statusLabel}] ${title}${stars}${body}`;
}

export function openTwitterIntent(text: string): void {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
