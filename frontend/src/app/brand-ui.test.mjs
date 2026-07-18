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

test("navbar uses soft selection and strong focus without changing neutral defaults", async () => {
  const navbar = await source("./components/NavBar.tsx");
  const searchClasses = [...navbar.matchAll(/"([^"]*focus:border-brand-bright[^"]*)"/g)].map(
    ([, classes]) => classes,
  );

  assert.match(navbar, /bg-brand-soft text-brand-strong/);
  assert.equal(searchClasses.length, 2);
  for (const classes of searchClasses) {
    assert.match(classes, /focus:ring-brand-strong/);
    assert.doesNotMatch(classes, /focus:ring-brand-light/);
  }
  assert.match(navbar, /text-neutral-600 hover:bg-neutral-100/);
});

test("entry-flow CTAs use accessible strong backgrounds and focus rings", async () => {
  for (const path of ["./page.tsx", "./onboarding/page.tsx", "./invite/page.tsx", "./squads/page.tsx"]) {
    const page = await source(path);
    const ctaClasses = [...page.matchAll(/className="([^"]*bg-brand-strong[^"]*)"/g)].map(
      ([, classes]) => classes,
    );

    assert.ok(ctaClasses.length > 0, path);
    for (const classes of ctaClasses) {
      assert.match(classes, /hover:bg-green-800/, path);
      assert.match(classes, /focus-visible:ring-brand-strong/, path);
      assert.doesNotMatch(classes, /focus-visible:ring-brand-light/, path);
    }
    assert.doesNotMatch(page, /bg-brand-bright[^\n]*text-white/, path);
  }
});
