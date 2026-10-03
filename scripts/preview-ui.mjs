// Screenshots the engine UI (menu, play, pause, game over) for recipes in a
// real browser, one art style each, into data/preview-ui/ plus contact sheets.
//   node scripts/preview-ui.mjs [recipeId] [styleId]
import "../src/config/env.js";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { DATA_DIR } from "../src/config/env.js";
import { listRecipes, recipeCode } from "../recipes/index.js";
import { getStyle, engineStyle, STYLE_PRESETS } from "../styles/presets.js";
import { findBrowser } from "../src/qa/browser.js";
import { buildGameHtml } from "../src/runtime/bundle.js";

const only = process.argv[2] ? process.argv[2].split(",") : null;
const forcedStyle = process.argv[3];
const styles = Object.keys(STYLE_PRESETS);
const out = join(DATA_DIR, "preview-ui");
await mkdir(out, { recursive: true });
const { default: puppeteer } = await import("puppeteer-core");
const profile = await mkdtemp(join(tmpdir(), "kult-ui-"));
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, userDataDir: profile, args: ["--no-sandbox", "--disable-gpu", "--mute-audio"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sheets = { menu: [], play: [], paused: [], over: [] };

try {
  let i = 0;
  for (const recipe of listRecipes()) {
    if (only && !only.includes(recipe.id)) continue;
    const styleId = forcedStyle || styles[i++ % styles.length];
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message)));
    const html = buildGameHtml({ gamePackage: { id: `preview-${recipe.id}`, title: recipe.name, style: engineStyle(getStyle(styleId)) }, gameCode: recipeCode(recipe.id), testMode: true });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await wait(1400);
    const shot = async (name) => {
      const file = join(out, `${recipe.id}-${styleId}-${name}.png`);
      await page.screenshot({ path: file });
      sheets[name].push(file);
    };
    await shot("menu");
    await page.evaluate(() => __KULT_TEST__.start());
    for (let k = 0; k < 8; k += 1) { await page.evaluate((x) => __KULT_TEST__.tap(x, 500), 120 + k * 20); await wait(180); }
    await shot("play");
    await page.evaluate(() => __KULT_TEST__.pause());
    await wait(500);
    await shot("paused");
    await page.evaluate(() => { __KULT_TEST__.start(); });
    await wait(300);
    await page.evaluate(() => { const g = window.__KULT_GAME__; g.addScore(1234); g.time = 83; __KULT_TEST__.end(); });
    await wait(1700);
    await shot("over");
    const fontsUsed = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family).filter((v, j, a) => a.indexOf(v) === j));
    console.log(`${recipe.id.padEnd(10)} ${styleId.padEnd(8)} fonts=${JSON.stringify(fontsUsed)} errors=${errors.length ? errors.join(" | ") : "none"}`);
    await page.close();
  }
} finally {
  await browser.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

for (const [name, files] of Object.entries(sheets)) {
  if (!files.length) continue;
  const tiles = await Promise.all(files.map(async (f, k) => ({ input: await sharp(f).resize(234, 506).png().toBuffer(), left: (k % 4) * 240, top: Math.floor(k / 4) * 512 })));
  await sharp({ create: { width: 960, height: Math.ceil(files.length / 4) * 512, channels: 3, background: "#1b1b1b" } }).composite(tiles).png().toFile(join(out, `sheet-${name}.png`));
}
console.log(`sheets in ${out}`);
