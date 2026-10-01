import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = join(here, "..", "..", "engine", "kult-engine.js");
const API_PATH = join(here, "..", "..", "engine", "API.md");

let engineCache = null;
let apiCache = null;

export function engineSource() {
  engineCache ??= readFileSync(ENGINE_PATH, "utf8");
  return engineCache;
}

export function engineApiReference() {
  apiCache ??= readFileSync(API_PATH, "utf8");
  return apiCache;
}

// The module shape creator-studio's player already runs: its sandbox declares
// `const gamePackage = {...}` and then executes this code with imports
// stripped. The engine reads gamePackage (sprites, style, title) from there.
export function buildGameModule(gameCode) {
  return `${engineSource()}\n\n// ---- game ----\n${String(gameCode || "").trim()}\n`;
}

// A self-contained page (used by the playtester and the /play route). Asset
// URLs can be swapped for data URIs so the page works with no network.
export function buildGameHtml({ gamePackage, gameCode, assetOverrides = null, testMode = false }) {
  const pkg = { ...gamePackage };
  delete pkg.refinement;
  if (assetOverrides && pkg.gameplayAssets) {
    pkg.gameplayAssets = { ...pkg.gameplayAssets, manifest: { ...pkg.gameplayAssets.manifest, ...assetOverrides } };
  }
  const json = JSON.stringify(pkg).replace(/</g, "\\u003c");
  const code = buildGameModule(gameCode).replace(/<\/script>/gi, "<\\/script>");
  const title = String(pkg.title || "Game").replace(/[<>&"]/g, "");
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${title}</title>
<style>html,body{margin:0;height:100%;background:#0b0918;overflow:hidden;overscroll-behavior:none}#game{display:block;touch-action:none;user-select:none;-webkit-user-select:none}</style>
</head><body><canvas id="game"></canvas>
<script>window.reportScore=window.reportScore||function(){};${testMode ? "window.__KULT_SEED__=1234;" : ""}</script>
<script>
const gamePackage = ${json};
${code}
</script>
</body></html>`;
}
