// Runs every recipe through the headless acceptance test. A recipe that fails
// here must never be offered to the Engineer agent as a seed.
import { listRecipes, recipeCode } from "../recipes/index.js";
import { smokeTest } from "../src/qa/smoke.js";

const only = process.argv[2];
let failed = 0;
for (const recipe of listRecipes()) {
  if (only && recipe.id !== only) continue;
  const report = smokeTest(recipeCode(recipe.id), { gamePackage: { title: recipe.name } });
  const m = report.metrics;
  const status = report.ok ? "PASS" : "FAIL";
  if (!report.ok) failed += 1;
  console.log(`${status} ${recipe.id.padEnd(10)} score=${m.maxScore} over=${JSON.stringify(m.overAtSeconds)} restart=${m.restartOk} peak=${m.peakEntities} ${report.ms}ms types=${JSON.stringify(m.types)}`);
  for (const f of report.failures) console.log(`   ✗ ${f}`);
  for (const w of report.warnings) console.log(`   ! ${w}`);
}
process.exit(failed ? 1 : 0);
