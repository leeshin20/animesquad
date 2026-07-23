const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";
const QUARTER: Record<string, number> = {
  WINTER: 1,
  SPRING: 2,
  SUMMER: 3,
  FALL: 4,
};

export async function fetchFolderArchive(
  year: number,
  season: string,
  fetcher: typeof fetch = fetch,
): Promise<{ blob: Blob; filename: string }> {
  const query = new URLSearchParams({ year: String(year), season });
  const response = await fetcher(
    `${BASE}/api/admin/anime/folder-archive?${query}`,
    { credentials: "include", cache: "no-store" },
  );
  if (!response.ok) throw new Error(`API ${response.status}`);
  const encoded = response.headers
    .get("content-disposition")
    ?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return {
    blob: await response.blob(),
    filename: encoded
      ? decodeURIComponent(encoded)
      : `${year}년-${QUARTER[season]}분기-애니-음원-폴더.zip`,
  };
}
