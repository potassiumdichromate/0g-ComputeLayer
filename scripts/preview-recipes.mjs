// Screenshots every recipe in a real browser (Chrome/Edge) under a rotation of
// art styles, into data/preview/. Use it to eyeball engine/recipe changes.
//   node scripts/preview-recipes.mjs [recipeId]
import "../src/config/env.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "../src/config/env.js";
import { listRecipes, recipeCode } from "../recipes/index.js";
import { getStyle, engineStyle, STYLE_PRESETS } from "../styles/presets.js";
import { captureGame } from "../src/qa/browser.js";

const only = process.argv[2];
const styles = Object.keys(STYLE_PRESETS);
const out = join(DATA_DIR, "preview");
await mkdir(out, { recursive: true });

let i = 0;
for (const recipe of listRecipes()) {
  if (only && recipe.id !== only) continue;
  const styleId = styles[i++ % styles.length];
  const cap = await captureGame({ gamePackage: { title: recipe.name, style: engineStyle(getStyle(styleId)) }, gameCode: recipeCode(recipe.id) });
  if (cap.skipped) { console.log(cap.reason); break; }
  for (const [k, shot] of cap.shots.entries()) await writeFile(join(out, `${recipe.id}-${styleId}-${k + 1}.png`), shot.png);
  console.log(`${recipe.id.padEnd(10)} ${styleId.padEnd(8)} state=${cap.state?.state} score=${cap.state?.score} blank=${cap.blank} errors=${cap.errors.length ? cap.errors.join(" | ") : "none"}`);
}
