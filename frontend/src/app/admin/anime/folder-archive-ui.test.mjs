import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin season panel wires the folder archive download", async () => {
  const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /import \{ fetchFolderArchive \} from "\.\/folder-archive"/);
  assert.match(page, /await fetchFolderArchive\(Number\(year\), season\)/);
  assert.match(page, /URL\.createObjectURL\(blob\)/);
  assert.match(page, /URL\.revokeObjectURL\(url\)/);
  assert.match(page, /음원 폴더 ZIP 다운로드/);
  assert.match(page, /ZIP 생성 중…/);
});
