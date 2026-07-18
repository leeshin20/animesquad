import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("Tailwind exposes the four approved brand roles", async () => {
  const config = await source("../../tailwind.config.ts");

  assert.match(config, /bright:\s*"#22C55E"/);
  assert.match(config, /strong:\s*"#15803D"/);
  assert.match(config, /soft:\s*"#DCFCE7"/);
  assert.match(config, /light:\s*"#4ADE80"/);
});

test("navbar uses soft selection and bright focus without changing neutral defaults", async () => {
  const navbar = await source("./components/NavBar.tsx");

  assert.match(navbar, /bg-brand-soft text-brand-strong/);
  assert.match(navbar, /focus:border-brand-bright/);
  assert.match(navbar, /focus:ring-brand-light/);
  assert.match(navbar, /text-neutral-600 hover:bg-neutral-100/);
});

test("entry-flow CTAs use the accessible strong green", async () => {
  for (const path of ["./page.tsx", "./onboarding/page.tsx", "./invite/page.tsx", "./squads/page.tsx"]) {
    const page = await source(path);
    assert.match(page, /bg-brand-strong/, path);
    assert.match(page, /hover:bg-green-800/, path);
    assert.doesNotMatch(page, /bg-brand-bright[^\n]*text-white/, path);
  }
});
