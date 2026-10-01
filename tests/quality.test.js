import test from "node:test";
import assert from "node:assert/strict";
import { listRecipes, recipeCode } from "../recipes/index.js";
import { smokeTest } from "../src/qa/smoke.js";
import { GameDesign } from "../src/contracts/index.js";
import { sanitizeSvg } from "../src/media/svg.js";

test("every recipe passes the headless acceptance test", () => {
  for (const recipe of listRecipes()) {
    const report = smokeTest(recipeCode(recipe.id), { gamePackage: { title: recipe.name } });
    assert.equal(report.ok, true, `${recipe.id}: ${report.failures.join("; ")}`);
  }
});

test("acceptance test catches the classic generated-game bugs", () => {
  const crash = smokeTest(`const g = KULT.game({}); g.setup((g) => { g.spawn("player", {}); }); g.update((g) => { g.data.board[0][1] = 2; });`);
  assert.equal(crash.ok, false);
  assert.ok(crash.failures.some((f) => f.includes("Runtime error")));

  const endsNormally = smokeTest(`const g = KULT.game({}); g.setup((g) => { g.spawn("player", {}); g.after(0.5, () => g.over()); }); `);
  assert.equal(endsNormally.ok, true, "a game that ends normally passes");

  const syntax = smokeTest(`const g = KULT.game({ title: "x" ;`);
  assert.ok(syntax.failures[0].startsWith("Syntax error"));

  const noGame = smokeTest(`const x = 1;`);
  assert.ok(noGame.failures.some((f) => f.includes("never called KULT.game")));

  const leak = smokeTest(`const g = KULT.game({}); g.setup((g) => { g.spawn("player", {}); }); g.update((g) => { for (let i = 0; i < 20; i++) g.spawn("dust", { x: 100, y: 100, keep: true }); });`);
  assert.ok(leak.failures.some((f) => f.includes("exploded")));
});

test("acceptance test times out infinite loops instead of hanging", () => {
  const report = smokeTest(`const g = KULT.game({}); g.setup((g) => { g.spawn("player", {}); }); g.update(() => { while (true) {} });`);
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((f) => f.includes("infinite loop")));
});

test("design contract guarantees exactly one player entity", () => {
  const d = GameDesign.parse({ title: "T", recipe: "runner", controls: {}, entities: [{ name: "Hero Cat", role: "player" }, { name: "cucumber", role: "hazard" }] });
  assert.equal(d.entities[0].name, "player");
  const d2 = GameDesign.parse({ title: "T", recipe: "runner", controls: {}, entities: [{ name: "rock", role: "obstacle" }] });
  assert.equal(d2.entities[0].name, "player");
});

test("svg sanitizer strips script, external refs and event handlers", () => {
  const { svg } = sanitizeSvg(`<svg viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><image href="file:///etc/passwd"/><rect fill="url(http://evil)" width="10" height="10"/><a href="https://x">k</a></svg>`);
  assert.ok(!/script|onload|file:|http:\/\/evil|<image/i.test(svg), svg);
});
