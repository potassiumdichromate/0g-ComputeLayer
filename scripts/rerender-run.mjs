// Re-renders a finished run's game on the CURRENT engine (real browser) and
// writes screenshots — for checking engine changes against real generated games.
//   node scripts/rerender-run.mjs <runId>
import "../src/config/env.js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../src/config/env.js";
import { captureGame } from "../src/qa/browser.js";
import { inlineManifest } from "../src/agents/playtest.js";

const runId = process.argv[2];
const run = JSON.parse(await readFile(join(DATA_DIR, "runs", runId, "run.json"), "utf8"));
const pkg = run.result.package;
const assets = run.nodes.assets.output;
const cap = await captureGame({
  gamePackage: { title: pkg.title, style: pkg.style, gameplayAssets: { manifest: await inlineManifest(assets), catalog: assets.catalog } },
  gameCode: run.result.gameCode
});
const out = join(DATA_DIR, "rerender", runId);
await mkdir(out, { recursive: true });
for (const [i, s] of cap.shots.entries()) await writeFile(join(out, `${i + 1}.png`), s.png);
console.log(`errors=${cap.errors.length ? cap.errors.join(" | ") : "none"} state=${JSON.stringify(cap.state?.state)} → ${out}`);
