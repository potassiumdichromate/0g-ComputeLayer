import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { buildGameHtml } from "../runtime/bundle.js";

// Real-browser capture: load the bundled game on a phone-sized screen, drive it
// through the engine's __KULT_TEST__ hook, and take screenshots a reviewer
// (human or vision model) can judge.

const CANDIDATES = [
  process.env.PLAYTEST_BROWSER_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
];

export function findBrowser() {
  return CANDIDATES.find((p) => p && existsSync(p)) ?? null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function isBlank(png) {
  const { channels } = await sharp(png).greyscale().stats();
  return (channels[0]?.stdev ?? 0) < 4;
}

export async function captureGame({ gamePackage, gameCode, viewport = { width: 390, height: 844 } }) {
  const browserPath = findBrowser();
  if (!browserPath) return { skipped: true, reason: "No Chrome/Edge found (set PLAYTEST_BROWSER_PATH)" };
  const { default: puppeteer } = await import("puppeteer-core");
  // A throwaway profile keeps a desktop Chrome/Edge that is already open from
  // swallowing the launch (single-instance handoff).
  const profile = await mkdtemp(join(tmpdir(), "kult-playtest-"));
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    userDataDir: profile,
    args: ["--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage", "--mute-audio", "--autoplay-policy=no-user-gesture-required"]
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    page.on("pageerror", (e) => errors.push(`Uncaught: ${String(e?.message ?? e).slice(0, 300)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`Console: ${m.text().slice(0, 300)}`); });
    await page.setContent(buildGameHtml({ gamePackage, gameCode, testMode: true }), { waitUntil: "load", timeout: 30000 });
    await wait(1200);
    const shots = [];
    const shoot = async (label) => shots.push({ label, png: Buffer.from(await page.screenshot({ type: "png" })) });
    const T = (expr) => page.evaluate(`window.__KULT_TEST__ ? (${expr}) : null`);

    await shoot("start menu");
    await T("__KULT_TEST__.start()");
    await wait(900);
    await shoot("1 second into play");
    const view = await T("__KULT_TEST__.view()") ?? { W: 360, H: 700 };
    const plan = [[0.5, 0.6], [0.25, 0.7], [0.75, 0.7], [0.5, 0.5], [0.3, 0.65], [0.7, 0.65]];
    for (let i = 0; i < 12; i += 1) {
      const [x, y] = plan[i % plan.length];
      await T(`__KULT_TEST__.tap(${view.W * x}, ${view.H * y})`);
      if (i % 3 === 0) await page.keyboard.press(i % 2 ? "ArrowLeft" : "ArrowRight");
      await wait(220);
    }
    await shoot("about 4 seconds of active play");
    const state = await T("({ state: __KULT_TEST__.state, score: __KULT_TEST__.score, lives: __KULT_TEST__.lives, types: __KULT_TEST__.types(), errors: __KULT_TEST__.errors })");
    const blank = await isBlank(shots[shots.length - 1].png);
    return { skipped: false, shots, errors: [...new Set([...errors, ...(state?.errors ?? []).map((e) => `Engine: ${e}`)])].slice(0, 12), state, blank };
  } finally {
    await browser.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}
