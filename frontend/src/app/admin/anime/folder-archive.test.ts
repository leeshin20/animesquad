import assert from "node:assert/strict";
import test from "node:test";
import { fetchFolderArchive } from "./folder-archive";

test("requests the selected archive and decodes its UTF-8 filename", async () => {
  let request: { input: string; init?: RequestInit } | undefined;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    request = { input: String(input), init };
    return new Response(new Blob(["zip"]), {
      status: 200,
      headers: {
        "content-disposition":
          "attachment; filename=\"anime-folders-2026-Q2.zip\"; filename*=UTF-8''2026%EB%85%84-2%EB%B6%84%EA%B8%B0.zip",
      },
    });
  };
  const result = await fetchFolderArchive(2026, "SPRING", fetcher as typeof fetch);
  assert.match(request!.input, /year=2026&season=SPRING$/);
  assert.equal(request!.init?.credentials, "include");
  assert.equal(request!.init?.cache, "no-store");
  assert.equal(result.filename, "2026년-2분기.zip");
  assert.equal(await result.blob.text(), "zip");
});

test("uses the deterministic fallback filename", async () => {
  const fetcher = async () => new Response(new Blob(["zip"]), { status: 200 });
  const result = await fetchFolderArchive(2026, "FALL", fetcher as typeof fetch);
  assert.equal(result.filename, "2026년-4분기-애니-음원-폴더.zip");
});

test("reports failed archive requests", async () => {
  const fetcher = async () => new Response("forbidden", { status: 403 });
  await assert.rejects(
    fetchFolderArchive(2026, "SPRING", fetcher as typeof fetch),
    /API 403/,
  );
});
