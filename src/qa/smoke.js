import vm from "node:vm";
import { engineSource } from "../runtime/bundle.js";

// Headless acceptance test. Runs engine + game code inside a mocked browser in
// a Node VM, then drives the game through the engine's __KULT_TEST__ hook the
// way a player would: start, play with taps/swipes/keys, lose, restart. Every
// VM call has a wall-clock timeout, so an infinite loop in generated code
// becomes a failed test instead of a hung worker.

function makeContext2d(stats) {
  const target = {
    canvas: null,
    measureText: (text) => ({ width: String(text).length * 9 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)) }),
    isPointInPath: () => false,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
  };
  const drawCalls = new Set(["fillRect", "strokeRect", "drawImage", "fillText", "strokeText", "arc", "ellipse", "moveTo", "lineTo", "translate", "rect"]);
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop !== "string") return undefined;
      return (...args) => {
        stats.calls += 1;
        if (drawCalls.has(prop) && args.some((a) => typeof a === "number" && !Number.isFinite(a))) stats.nanDraws += 1;
        if (prop === "drawImage" || prop === "fillRect" || prop === "fill") stats.paints += 1;
        return undefined;
      };
    },
    set(t, prop, value) { t[prop] = value; return true; }
  });
}

function makeWindow({ width = 390, height = 844, seed = 1234 } = {}) {
  const stats = { calls: 0, nanDraws: 0, paints: 0 };
  const listeners = {};
  const on = (type, fn) => { (listeners[type] ??= []).push(fn); };
  const ctx2d = makeContext2d(stats);
  const canvas = {
    id: "game", width, height, style: {},
    getContext: () => ctx2d,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    addEventListener: on, removeEventListener() {}, setPointerCapture() {}
  };
  ctx2d.canvas = canvas;
  const storage = new Map();
  const logs = [];
  class FakeImage {
    constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; this.onload = null; this.onerror = null; this._src = ""; }
    set src(value) { this._src = value; }
    get src() { return this._src; }
  }
  const win = {
    innerWidth: width, innerHeight: height, devicePixelRatio: 1,
    __KULT_MANUAL__: true, __KULT_SEED__: seed,
    addEventListener: on, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    performance: { now: () => Date.now() },
    localStorage: {
      getItem: (k) => (storage.has(String(k)) ? storage.get(String(k)) : null),
      setItem: (k, v) => storage.set(String(k), String(v)),
      removeItem: (k) => storage.delete(String(k)),
      clear: () => storage.clear()
    },
    Image: FakeImage,
    reportScore: (score) => { win.__reported = score; },
    console: {
      log: (...a) => logs.push(a.join(" ")), info: () => {}, warn: () => {}, debug: () => {},
      error: (...a) => logs.push("ERROR " + a.join(" "))
    },
    setTimeout: (fn) => { if (typeof fn === "function") Promise.resolve().then(fn); return 0; },
    clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    document: {
      querySelector: (sel) => (sel === "#game" || sel === "canvas" ? canvas : null),
      getElementById: (id) => (id === "game" ? canvas : null),
      createElement: () => canvas,
      body: { appendChild() {}, style: {} },
      addEventListener: on, hidden: false
    },
    Math, Date, JSON, Promise, Array, Object, Number, String, Boolean, Map, Set, WeakMap, Symbol, Error, TypeError, RangeError,
    Float32Array, Uint8Array, Uint8ClampedArray, Int32Array, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite
  };
  win.window = win;
  win.globalThis = win;
  win.self = win;
  return { win, stats, logs, listeners };
}

function stripModuleSyntax(code) {
  return String(code || "")
    .replace(/^[ \t]*import\s+[^;\n]*from\s+["'][^"']*["'];?[ \t]*$/gm, "")
    .replace(/^[ \t]*import\s+["'][^"']*["'];?[ \t]*$/gm, "")
    .replace(/^[ \t]*export\s+default\s+/gm, "")
    .replace(/^[ \t]*export\s*\{[^}]*\}[ \t]*;?[ \t]*$/gm, "")
    .replace(/^([ \t]*)export\s+(const|let|var|function|class|async)/gm, "$1$2");
}

export function checkSyntax(gameCode) {
  try {
    new vm.Script(stripModuleSyntax(gameCode), { filename: "game.js" });
    return null;
  } catch (error) {
    const line = String(error.stack || "").match(/game\.js:(\d+)/)?.[1];
    return { message: error.message, line: line ? Number(line) : null };
  }
}

/**
 * Plays the game headlessly. Returns a report with `ok`, `failures` (must-fix)
 * and `warnings` (quality signals), plus metrics.
 */
export function smokeTest(gameCode, { gamePackage = {}, seconds = 20, seed = 1234 } = {}) {
  const started = Date.now();
  const report = {
    ok: false, failures: [], warnings: [], errors: [],
    metrics: { reachedPlay: false, reachedOver: false, restartOk: null, maxScore: 0, peakEntities: 0, types: {}, overAtSeconds: [], nanDraws: 0 }
  };
  const syntax = checkSyntax(gameCode);
  if (syntax) {
    report.failures.push(`Syntax error${syntax.line ? ` on line ${syntax.line}` : ""}: ${syntax.message}`);
    return finish();
  }

  const { win, stats, logs } = makeWindow({ seed });
  const context = vm.createContext(win);
  const source = `var gamePackage = ${JSON.stringify(gamePackage)};\n${engineSource()}\n;(function(){\n${stripModuleSyntax(gameCode)}\n})();`;
  const run = (code, timeout = 2500) => vm.runInContext(code, context, { timeout, filename: "harness.js" });

  try {
    run(source, 4000);
  } catch (error) {
    report.failures.push(`Game code throws while loading: ${error.message}`);
    return finish();
  }
  const T = () => win.__KULT_TEST__;
  if (!T()) {
    report.failures.push("The game never called KULT.game(...)");
    return finish();
  }

  const step = (frames) => {
    try { run(`__KULT_TEST__.step(${frames})`); } catch (error) {
      report.failures.push(error.code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ? "A frame took more than 2.5 s (infinite loop?)" : `Frame crashed: ${error.message}`);
      throw error;
    }
  };
  const call = (expr) => run(`__KULT_TEST__.${expr}`);
  const view = run("__KULT_TEST__.view()");
  const W = view.W, H = view.H;
  const sample = () => {
    const n = T().entityCount;
    report.metrics.peakEntities = Math.max(report.metrics.peakEntities, n);
    report.metrics.maxScore = Math.max(report.metrics.maxScore, T().score);
    for (const [k, v] of Object.entries(T().types())) report.metrics.types[k] = Math.max(report.metrics.types[k] ?? 0, v);
  };

  try {
    call("boot()");
    step(2);
    if (T().state !== "menu") report.failures.push(`Expected the start menu after loading, got state "${T().state}"`);

    // Round 1: play like an active, slightly random player.
    call("start()");
    step(10);
    if (T().state === "play") report.metrics.reachedPlay = true;
    else report.failures.push(`Tapping start did not enter play (state "${T().state}")`);
    report.metrics.customDraw = Boolean(T().customDraw);
    if (T().entityCount === 0 && !report.metrics.customDraw) report.warnings.push("Nothing is spawned when the run starts (empty screen)");

    const actions = [
      () => call(`tap(${W * 0.5}, ${H * 0.6})`),
      () => call(`tap(${W * 0.2}, ${H * 0.7})`),
      () => call(`tap(${W * 0.8}, ${H * 0.7})`),
      () => call("swipe('left')"),
      () => call("swipe('right')"),
      () => call("swipe('up')"),
      () => { call("key('ArrowLeft')"); step(8); call("keyUp('ArrowLeft')"); },
      () => { call("key('ArrowRight')"); step(8); call("keyUp('ArrowRight')"); },
      () => { call("key('Space')"); step(2); call("keyUp('Space')"); },
      () => { call(`down(${W * 0.5}, ${H * 0.75})`); step(20); call(`up(${W * 0.6}, ${H * 0.75})`); }
    ];
    let t = 0, i = 0;
    const frames = Math.round(seconds * 60);
    while (t < frames) {
      if (T().state === "over") break;
      actions[(i * 7 + 3) % actions.length]();
      i += 1;
      step(12);
      t += 12;
      sample();
    }
    if (T().state === "over") {
      report.metrics.reachedOver = true;
      // The game clock stops at game over, so it is the run's true length.
      report.metrics.overAtSeconds.push(Number(T().time.toFixed(1)));
      // Must NOT auto-restart.
      step(150);
      if (T().state !== "over") report.failures.push("The game restarted by itself after game over (it must wait for a tap)");
      // Restart must reset the run.
      const scoreBefore = T().score;
      call(`tap(${W / 2}, ${H / 2})`);
      step(3);
      const restarted = T().state === "play";
      // Games may score on their first frames (climbers, distance counters),
      // so "reset" means the clock restarted and the score fell back.
      const reset = T().time < 0.2 && (T().score === 0 || T().score < scoreBefore);
      report.metrics.restartOk = restarted && reset;
      if (!restarted) report.failures.push("Tapping after game over did not restart the game");
      else if (!reset) report.failures.push(`Restart did not reset the run (score ${T().score})`);
      step(120);
      sample();
    }

    // Round 2: an idle player (no input) — must not crash.
    if (T().state !== "play") { call("start()"); step(4); }
    for (let k = 0; k < 8 && T().state === "play"; k += 1) { step(60); sample(); }
    if (T().state === "over") report.metrics.overAtSeconds.push(Number(T().time.toFixed(1)));
  } catch {
    // failure already recorded by step()
  }

  report.errors = [...new Set([...(T()?.errors ?? []), ...logs.filter((l) => l.startsWith("ERROR")).map((l) => l.slice(6))])].slice(0, 10);
  report.metrics.nanDraws = stats.nanDraws;
  return finish();

  function finish() {
    const m = report.metrics;
    if (report.errors.length) report.failures.push(...report.errors.map((e) => `Runtime error: ${e}`));
    if (m.peakEntities > 1500) report.failures.push(`Entity count exploded to ${m.peakEntities} (spawned objects are never removed)`);
    if (m.reachedPlay && m.peakEntities <= 1 && !m.customDraw) report.warnings.push("Only one entity ever existed — the game world looks empty");
    if (m.reachedPlay && m.maxScore === 0) report.warnings.push("Score never changed during ~20 s of active play");
    if (m.overAtSeconds.length && Math.max(...m.overAtSeconds) < 2) report.warnings.push("The run ends in under 2 seconds — likely far too hard or an instant-death bug");
    if (m.nanDraws > 20) report.warnings.push(`${m.nanDraws} draw calls received NaN coordinates (some values are undefined)`);
    report.failures = [...new Set(report.failures)];
    report.ok = report.failures.length === 0;
    report.ms = Date.now() - started;
    return report;
  }
}
