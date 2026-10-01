/* KULT_ENGINE_V1
 * KULT Engine — an AI-first 2D game runtime.
 *
 * The generated game code only describes the GAME (entities, rules, spawning,
 * scoring). Everything that makes a browser game feel finished — responsive
 * scaling, unified touch/keyboard input, start/pause/game-over menus, restart,
 * HUD, particles, screen shake, floating score text, procedural sound, sprite
 * rendering with flip/animation, collision, difficulty ramps and a test hook —
 * lives here, written and tested once.
 *
 * Coordinates are LOGICAL: portrait games are 360 wide and g.H tall (560–780),
 * landscape games are 360 tall. Entity x/y are CENTERS.
 */
(function (root) {
  "use strict";
  if (root.KULT && root.KULT.version) return;

  const PKG = (() => {
    try {
      // eslint-disable-next-line no-undef
      if (typeof gamePackage !== "undefined" && gamePackage) return gamePackage;
    } catch (e) { /* not declared */ }
    return root.gamePackage || {};
  })();

  // ---------------------------------------------------------------- utilities
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const now = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const EASE = {
    linear: (t) => t,
    in: (t) => t * t * t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)
  };
  const store = {
    get(key, fallback) {
      try { const v = root.localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { root.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
    }
  };

  function shade(hex, amount) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const f = (c) => clamp(Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)), 0, 255);
    const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // ------------------------------------------------------------------- style
  const DEFAULT_STYLE = {
    font: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
    outline: "#1b1733",
    outlineWidth: 3,
    radius: 8,
    deco: "stars",
    palette: {
      bg1: "#1a1446", bg2: "#3a1d6e", primary: "#ffcf3f", secondary: "#38d6ff",
      accent: "#ff4f9a", danger: "#ff5a4f", good: "#5dff8f", text: "#ffffff"
    }
  };

  // ------------------------------------------------------------------- audio
  function createAudio() {
    let ctx = null;
    let master = null;
    let muted = store.get("kult:muted", false);
    function unlock() {
      if (ctx) { if (ctx.state === "suspended" && ctx.resume) ctx.resume().catch(() => {}); return; }
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.25;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; }
    }
    function tone(freq, dur, type, vol, slide, delay) {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function noise(dur, vol, delay) {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime + (delay || 0);
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = vol || 0.4;
      src.buffer = buffer; src.connect(g); g.connect(master); src.start(t0);
    }
    const arp = (notes, step, type) => notes.forEach((f, i) => tone(f, 0.14, type || "triangle", 0.28, 0, i * step));
    const SFX = {
      jump: () => tone(320, 0.15, "square", 0.25, 420),
      flap: () => tone(520, 0.08, "triangle", 0.25, 220),
      coin: () => { tone(880, 0.08, "square", 0.2); tone(1320, 0.12, "square", 0.2, 0, 0.07); },
      pop: () => tone(700, 0.07, "sine", 0.3, 320),
      shoot: () => tone(950, 0.08, "square", 0.14, -650),
      hit: () => { noise(0.16, 0.45); tone(170, 0.18, "sawtooth", 0.25, -110); },
      explode: () => { noise(0.4, 0.6); tone(90, 0.4, "sawtooth", 0.28, -55); },
      bounce: () => tone(420, 0.06, "square", 0.18, 90),
      power: () => arp([523, 659, 784, 1047], 0.06),
      level: () => arp([392, 523, 659, 784, 1047], 0.08),
      win: () => arp([523, 659, 784, 1047, 1319], 0.09),
      lose: () => arp([392, 330, 262, 196], 0.14),
      click: () => tone(600, 0.05, "square", 0.14)
    };
    return {
      unlock,
      play(name) { if (!ctx || muted) return; try { (SFX[name] || SFX.click)(); } catch (e) { /* audio is optional */ } },
      toggle() {
        muted = !muted;
        store.set("kult:muted", muted);
        if (master) master.gain.value = muted ? 0 : 0.25;
        return muted;
      },
      get muted() { return muted; }
    };
  }

  // ------------------------------------------------------------------ assets
  function loadAssets() {
    const manifest = Object.assign({}, (PKG.gameplayAssets && PKG.gameplayAssets.manifest) || {}, root.KULT_ASSETS || {});
    const catalog = {};
    const list = (PKG.gameplayAssets && PKG.gameplayAssets.catalog) || [];
    for (const entry of Array.isArray(list) ? list : []) if (entry && entry.name) catalog[entry.name] = entry;
    const images = {};
    const ImageCtor = root.Image;
    for (const name of Object.keys(manifest)) {
      if (!ImageCtor || !manifest[name]) continue;
      try {
        const img = new ImageCtor();
        img.src = manifest[name];
        images[name] = img;
      } catch (e) { /* ignore */ }
    }
    return {
      catalog,
      has(name) { return Boolean(images[name]); },
      ready(name) { const img = images[name]; return Boolean(img && img.complete && img.naturalWidth); },
      get(name) { return images[name]; },
      aspect(name) {
        const img = images[name];
        if (img && img.naturalWidth && img.naturalHeight) return img.naturalWidth / img.naturalHeight;
        const c = catalog[name];
        return c && c.width && c.height ? c.width / c.height : 1;
      },
      facing(name) { return (catalog[name] && catalog[name].facing) || "right"; },
      frames(name) {
        const out = [name];
        for (let i = 2; i <= 4; i += 1) if (images[name + "_f" + i]) out.push(name + "_f" + i);
        return out;
      }
    };
  }

  // ==================================================================== game
  function game(config) {
    config = config || {};
    if (root.__KULT_GAME__) return root.__KULT_GAME__;
    const doc = root.document;
    const style = Object.assign({}, DEFAULT_STYLE, PKG.style || {}, config.style || {});
    style.palette = Object.assign({}, DEFAULT_STYLE.palette, (PKG.style && PKG.style.palette) || {}, config.palette || {}, (config.style && config.style.palette) || {});
    const pal = style.palette;
    const colorOf = (c, fallback) => (c && pal[c]) || c || fallback || pal.primary;

    const canvas = (doc.querySelector && doc.querySelector("#game")) || (() => {
      const c = doc.createElement("canvas");
      c.id = "game";
      doc.body.appendChild(c);
      return c;
    })();
    const ctx = canvas.getContext("2d");
    const audio = createAudio();
    const assets = loadAssets();
    const seed = Number(config.seed || PKG.seed || root.__KULT_SEED__) || Math.floor(Math.random() * 1e9);
    const rng = mulberry32(seed);
    const manual = Boolean(root.__KULT_MANUAL__);
    const errors = [];

    const view = { W: 360, H: 640, scale: 1, ox: 0, oy: 0, dpr: 1 };
    const cam = { x: 0, y: 0, target: null, opts: {}, shakeT: 0, shakeAmp: 0, sx: 0, sy: 0 };
    let entities = [];
    let particles = [];
    let floats = [];
    let tweens = [];
    let timers = [];
    let rules = [];
    let inSetup = false;
    let state = "boot";
    let stateT = 0;
    let flashFx = null;
    let levelBanner = null;
    let prevBest = 0;
    let lastT = now();
    let started = false;
    const hooks = { setup: config.setup || null, update: config.update || null, draw: config.draw || null, drawBehind: config.drawBehind || null, onLevel: config.onLevel || null, onStart: config.onStart || null, onOver: config.onOver || null };
    const hudValues = {};
    const bestKey = "kult:best:" + String(PKG.id || config.title || PKG.title || "game");
    const world = Object.assign({ gravity: 0, floor: null }, config.world || {});

    function recordError(error, where) {
      const message = String((error && error.message) || error) + (where ? " (in " + where + ")" : "");
      if (!errors.includes(message)) {
        errors.push(message);
        if (errors.length <= 5 && root.console) root.console.error("[KULT] " + message, error && error.stack ? error.stack : "");
      }
    }
    function safe(fn, where, a, b, c) {
      if (typeof fn !== "function") return undefined;
      try { return fn(a, b, c); } catch (error) { recordError(error, where); return undefined; }
    }

    // ------------------------------------------------------------- viewport
    function resize() {
      const cw = Math.max(1, root.innerWidth || 360);
      const ch = Math.max(1, root.innerHeight || 640);
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      if (canvas.style) { canvas.style.width = cw + "px"; canvas.style.height = ch + "px"; canvas.style.touchAction = "none"; }
      const orientation = config.orientation || "portrait";
      const portrait = orientation === "portrait" || (orientation === "any" && ch >= cw);
      if (portrait) { view.W = 360; view.H = Math.round(clamp((360 * ch) / cw, 560, 780)); }
      else { view.H = 360; view.W = Math.round(clamp((360 * cw) / ch, 560, 780)); }
      view.scale = Math.min(canvas.width / view.W, canvas.height / view.H);
      view.ox = (canvas.width - view.W * view.scale) / 2;
      view.oy = (canvas.height - view.H * view.scale) / 2;
      view.dpr = dpr;
      g.W = view.W;
      g.H = view.H;
    }

    // ---------------------------------------------------------------- input
    const ACTION_KEYS = ["Space", "Enter", "ArrowUp", "KeyW", "KeyZ", "KeyX", "KeyJ"];
    const input = {
      x: 180, y: 320, down: false, pressed: false, released: false, action: false,
      swipe: null, taps: [], keys: new Set(), keysPressed: new Set(),
      startX: 0, startY: 0, startT: 0,
      get held() { return this.down || ACTION_KEYS.some((k) => this.keys.has(k)); },
      key(code) { return this.keys.has(code); },
      keyPressed(code) { return this.keysPressed.has(code); },
      axis() {
        let x = 0, y = 0;
        if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) x -= 1;
        if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) x += 1;
        if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) y -= 1;
        if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) y += 1;
        if (!x && !y && this.down) {
          const dx = this.x - this.startX, dy = this.y - this.startY;
          const d = Math.hypot(dx, dy);
          if (d > 8) { const k = Math.min(1, d / 50); x = (dx / d) * k; y = (dy / d) * k; }
        }
        const len = Math.hypot(x, y);
        return len > 1 ? { x: x / len, y: y / len } : { x, y };
      },
      get side() {
        if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) return -1;
        if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) return 1;
        if (this.down) return this.x < view.W / 2 ? -1 : 1;
        return 0;
      }
    };
    const injected = [];

    function toLogical(clientX, clientY) {
      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: canvas.width, height: canvas.height };
      const px = ((clientX - rect.left) * canvas.width) / Math.max(1, rect.width);
      const py = ((clientY - rect.top) * canvas.height) / Math.max(1, rect.height);
      return { x: (px - view.ox) / view.scale, y: (py - view.oy) / view.scale };
    }
    function uiButtons() {
      return [
        { id: "pause", x: view.W - 26, y: 26, r: 17 },
        { id: "mute", x: view.W - 66, y: 26, r: 17 }
      ];
    }
    function pointerDown(p) {
      audio.unlock();
      if (state === "play" || state === "paused") {
        for (const b of uiButtons()) {
          if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 6) {
            if (b.id === "mute") audio.toggle();
            else setState(state === "paused" ? "play" : "paused");
            return;
          }
        }
      }
      input.x = p.x; input.y = p.y;
      input.down = true; input.pressed = true;
      input.startX = p.x; input.startY = p.y; input.startT = now();
    }
    function pointerUp(p) {
      if (!input.down) return;
      input.x = p.x; input.y = p.y;
      input.down = false; input.released = true;
      const dx = p.x - input.startX, dy = p.y - input.startY;
      const d = Math.hypot(dx, dy);
      if (d < 14) input.taps.push({ x: p.x, y: p.y });
      else if (d > 30 && now() - input.startT < 600) input.swipe = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    }
    function bindInput() {
      if (!canvas.addEventListener) return;
      canvas.addEventListener("pointerdown", (e) => { if (canvas.setPointerCapture && e.pointerId != null) { try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } } pointerDown(toLogical(e.clientX, e.clientY)); });
      canvas.addEventListener("pointermove", (e) => { const p = toLogical(e.clientX, e.clientY); input.x = p.x; input.y = p.y; });
      canvas.addEventListener("pointerup", (e) => pointerUp(toLogical(e.clientX, e.clientY)));
      canvas.addEventListener("pointercancel", (e) => pointerUp(toLogical(e.clientX, e.clientY)));
      canvas.addEventListener("touchstart", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
      if (root.addEventListener) {
        root.addEventListener("keydown", (e) => {
          audio.unlock();
          if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code) && e.preventDefault) e.preventDefault();
          if (!e.repeat) {
            input.keysPressed.add(e.code);
            if (ACTION_KEYS.includes(e.code)) input.action = true;
            const dir = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down" }[e.code];
            if (dir) input.swipe = dir;
            if ((e.code === "KeyP" || e.code === "Escape") && (state === "play" || state === "paused")) setState(state === "paused" ? "play" : "paused");
            if (e.code === "KeyM") audio.toggle();
          }
          input.keys.add(e.code);
        });
        root.addEventListener("keyup", (e) => input.keys.delete(e.code));
        root.addEventListener("resize", resize);
        root.addEventListener("blur", () => { input.keys.clear(); input.down = false; });
      }
      if (doc.addEventListener) doc.addEventListener("visibilitychange", () => { if (doc.hidden && state === "play") setState("paused"); });
    }
    function applyInjected() {
      while (injected.length) {
        const ev = injected.shift();
        // A delayed event (the release half of a tap) waits one frame so the
        // press is visible to game code on its own frame.
        if (ev.delay) { delete ev.delay; injected.unshift(ev); break; }
        if (ev.type === "down") pointerDown(ev);
        else if (ev.type === "up") pointerUp(ev);
        else if (ev.type === "keydown") { input.keys.add(ev.code); input.keysPressed.add(ev.code); if (ACTION_KEYS.includes(ev.code)) input.action = true; }
        else if (ev.type === "keyup") input.keys.delete(ev.code);
        else if (ev.type === "swipe") input.swipe = ev.dir;
      }
    }
    function endFrameInput() {
      input.pressed = false; input.released = false; input.action = false;
      input.swipe = null; input.taps.length = 0; input.keysPressed.clear();
    }

    // ------------------------------------------------------------- entities
    let nextId = 1;
    function Entity(type, o) {
      o = o || {};
      this.id = nextId++;
      this.type = type;
      this.x = o.x != null ? o.x : view.W / 2;
      this.y = o.y != null ? o.y : view.H / 2;
      this.h = o.h != null ? o.h : (o.size != null ? o.size : (o.r != null ? o.r * 2 : 32));
      this.sprite = o.sprite !== undefined ? o.sprite : (assets.has(type) ? type : null);
      this.autoW = o.w == null && o.size == null && o.r == null && Boolean(this.sprite);
      this.w = o.w != null ? o.w : (this.autoW ? this.h * assets.aspect(this.sprite) : this.h);
      this.vx = o.vx || 0; this.vy = o.vy || 0; this.ax = o.ax || 0; this.ay = o.ay || 0;
      this.gravity = o.gravity != null ? o.gravity : 0;
      this.drag = o.drag || 0;
      this.maxSpeed = o.maxSpeed || 0;
      this.rot = o.rot || 0; this.spin = o.spin || 0;
      this.scale = o.scale != null ? o.scale : 1;
      this.alpha = o.alpha != null ? o.alpha : 1;
      this.color = o.color || null;
      this.shape = o.shape || (o.r != null ? "circle" : "rect");
      this.face = Boolean(o.face);
      this.label = o.label != null ? String(o.label) : null;
      this.labelColor = o.labelColor || null;
      this.tags = new Set([type].concat(o.tags || []));
      this.hp = o.hp != null ? o.hp : 1;
      this.maxHp = this.hp;
      this.z = o.z || 0;
      this.ttl = o.ttl != null ? o.ttl : null;
      this.bounds = o.bounds || "none";
      this.fixed = Boolean(o.fixed);
      this.solid = Boolean(o.solid);
      this.oneWay = Boolean(o.oneWay);
      this.body = Boolean(o.body);
      this.hitbox = o.hitbox != null ? o.hitbox : 0.82;
      this.shadow = Boolean(o.shadow);
      this.flipX = Boolean(o.flipX);
      this.autoFlip = o.autoFlip != null ? o.autoFlip : true;
      this.keep = Boolean(o.keep);
      this.glow = o.glow || null;
      this.draw = typeof o.draw === "function" ? o.draw : null;
      this.data = o.data || {};
      this.dead = false;
      this.age = 0;
      this.grounded = false;
      this.invuln = 0;
      this.flashT = 0;
      this.popT = o.pop === false ? 0 : 0.22;
      this.squash = 0;
      this.animT = 0;
      this.frame = 0;
      this.brains = [];
      if (o.moves) this.moves(o.moves, o.movesOpts || {});
    }
    Entity.prototype.is = function (tag) { return this.tags.has(tag); };
    Entity.prototype.tag = function (tag) { this.tags.add(tag); return this; };
    Entity.prototype.kill = function (opts) {
      if (this.dead) return this;
      this.dead = true;
      if (opts && opts.burst !== false) {
        const b = typeof opts.burst === "object" ? opts.burst : {};
        g.burst(this.x, this.y, Object.assign({ color: colorOf(this.color), count: 14 }, b));
      }
      if (opts && opts.sfx) audio.play(opts.sfx);
      return this;
    };
    Entity.prototype.hit = function (damage, opts) {
      if (this.invuln > 0 || this.dead) return false;
      this.hp -= damage == null ? 1 : damage;
      this.flashT = 0.12;
      if (opts && opts.invuln) this.invuln = opts.invuln;
      if (this.hp <= 0) { this.kill(Object.assign({ burst: true }, opts || {})); return true; }
      return false;
    };
    Entity.prototype.flash = function (t) { this.flashT = t || 0.12; return this; };
    Entity.prototype.pop = function () { this.popT = 0.22; return this; };
    Entity.prototype.distanceTo = function (o) { return Math.hypot(o.x - this.x, o.y - this.y); };
    Entity.prototype.angleTo = function (o) { return Math.atan2(o.y - this.y, o.x - this.x); };
    Entity.prototype.moveToward = function (x, y, speed) {
      const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy) || 1;
      this.vx = (dx / d) * speed; this.vy = (dy / d) * speed;
      return this;
    };
    Entity.prototype.moves = function (kind, opts) {
      const make = BEHAVIORS[kind];
      if (!make) { recordError(new Error("Unknown movement '" + kind + "'"), "moves"); return this; }
      this.brains.push(make(this, opts || {}));
      return this;
    };
    Entity.prototype.shoots = function (opts) {
      this.brains.push(shooter(this, opts || {}));
      return this;
    };
    Object.defineProperty(Entity.prototype, "left", { get() { return this.x - this.w / 2; } });
    Object.defineProperty(Entity.prototype, "right", { get() { return this.x + this.w / 2; } });
    Object.defineProperty(Entity.prototype, "top", { get() { return this.y - this.h / 2; } });
    Object.defineProperty(Entity.prototype, "bottom", { get() { return this.y + this.h / 2; } });

    // ------------------------------------------------------------ behaviors
    function jumpFx(e, strength) { e.squash = -0.25 * (strength || 1); audio.play("jump"); }
    const BEHAVIORS = {
      platformer(e, o) {
        e.body = true;
        e.gravity = o.gravity != null ? o.gravity : (world.gravity || 1100);
        const speed = o.speed || 170, jump = o.jump || 440;
        let coyote = 0, jumps = 0;
        return (dt) => {
          const dir = input.axis().x || input.side;
          e.vx = lerp(e.vx, dir * speed, Math.min(1, dt * (e.grounded ? 14 : 7)));
          if (e.grounded) { coyote = 0.1; jumps = 0; } else coyote -= dt;
          const wantJump = input.action || input.taps.length > 0 || input.swipe === "up";
          if (wantJump && (coyote > 0 || (o.doubleJump && jumps < 2))) {
            e.vy = -jump; coyote = 0; jumps += 1; e.grounded = false; jumpFx(e);
          }
          if (!input.held && e.vy < 0 && o.variableJump !== false) e.vy += e.gravity * dt * 0.8;
        };
      },
      runner(e, o) {
        e.body = true;
        e.gravity = o.gravity != null ? o.gravity : (world.gravity || 1400);
        const jump = o.jump || 480;
        let jumps = 0;
        return (dt) => {
          if (e.grounded) jumps = 0;
          const want = input.pressed || input.action || input.swipe === "up";
          if (want && (e.grounded || (o.doubleJump !== false && jumps < 2))) {
            e.vy = -jump * (jumps > 0 ? 0.85 : 1); jumps += 1; e.grounded = false; jumpFx(e);
          }
          if (!input.held && e.vy < 0) e.vy += e.gravity * dt * 1.2;
          if (o.duck && (input.swipe === "down" || input.key("ArrowDown"))) e.vy = Math.max(e.vy, jump);
        };
      },
      flap(e, o) {
        e.gravity = o.gravity != null ? o.gravity : 950;
        const flap = o.flap || 310, maxFall = o.maxFall || 520;
        return () => {
          if (input.pressed || input.action) { e.vy = -flap; e.squash = -0.18; audio.play("flap"); }
          if (e.vy > maxFall) e.vy = maxFall;
          if (o.tilt !== false) e.rot = clamp(e.vy / 700, -0.45, 1.1);
        };
      },
      topdown(e, o) {
        const speed = o.speed || 180;
        if (e.bounds === "none") e.bounds = "clamp";
        return (dt) => {
          const a = input.axis();
          e.vx = lerp(e.vx, a.x * speed, Math.min(1, dt * 12));
          e.vy = lerp(e.vy, a.y * speed, Math.min(1, dt * 12));
          if (e.autoFlip && Math.abs(e.vx) > 5) e.flipX = e.vx < 0 && assets.facing(e.sprite) === "right";
        };
      },
      drag(e, o) {
        const axis = o.axis || "x", k = o.lerp || 14, keySpeed = o.speed || 300;
        if (e.bounds === "none") e.bounds = "clamp";
        const offsetY = o.offsetY != null ? o.offsetY : -40;
        return (dt) => {
          const a = input.axis();
          if (input.down) {
            if (axis.includes("x")) e.x = lerp(e.x, input.x, Math.min(1, dt * k));
            if (axis.includes("y")) e.y = lerp(e.y, input.y + offsetY, Math.min(1, dt * k));
          } else {
            if (axis.includes("x")) e.x += a.x * keySpeed * dt;
            if (axis.includes("y")) e.y += a.y * keySpeed * dt;
          }
        };
      },
      lanes(e, o) {
        const count = o.lanes || 3;
        let lane = o.start != null ? o.start : Math.floor(count / 2);
        e.data.lane = lane;
        return (dt) => {
          let move = 0;
          if (input.swipe === "left") move = -1;
          else if (input.swipe === "right") move = 1;
          else if (input.taps.length) move = input.taps[0].x < view.W / 2 ? -1 : 1;
          if (move) {
            const next = clamp(lane + move, 0, count - 1);
            if (next !== lane) { lane = next; e.squash = 0.15; audio.play("click"); }
          }
          e.data.lane = lane;
          e.x = lerp(e.x, g.lane(lane, count), Math.min(1, dt * 16));
          e.rot = lerp(e.rot, (g.lane(lane, count) - e.x) * -0.004, Math.min(1, dt * 10));
        };
      },
      chase(e, o) {
        const speed = o.speed || 80;
        return (dt) => {
          const target = typeof o.target === "string" ? g.first(o.target) : o.target;
          if (!target || target.dead) return;
          const ang = Math.atan2(target.y - e.y, target.x - e.x);
          e.vx = lerp(e.vx, Math.cos(ang) * speed, Math.min(1, dt * (o.turn || 4)));
          e.vy = lerp(e.vy, Math.sin(ang) * speed, Math.min(1, dt * (o.turn || 4)));
          if (e.autoFlip && Math.abs(e.vx) > 5) e.flipX = e.vx < 0 && assets.facing(e.sprite) === "right";
        };
      },
      patrol(e, o) {
        const speed = o.speed || 60;
        const from = o.from != null ? o.from : e.x - 60, to = o.to != null ? o.to : e.x + 60;
        if (!e.vx) e.vx = speed;
        return () => {
          if (e.x <= from) e.vx = Math.abs(speed);
          if (e.x >= to) e.vx = -Math.abs(speed);
          if (e.autoFlip) e.flipX = e.vx < 0 && assets.facing(e.sprite) === "right";
        };
      },
      sine(e, o) {
        const amp = o.amp || 40, freq = o.freq || 1.5, axis = o.axis || "x";
        const base = axis === "x" ? e.x : e.y;
        const phase = o.phase != null ? o.phase : rng() * Math.PI * 2;
        return () => {
          const v = base + Math.sin(e.age * freq * Math.PI * 2 + phase) * amp;
          if (axis === "x") e.x = v; else e.y = v;
        };
      },
      fall(e, o) {
        e.vy = o.speed || 160;
        if (e.bounds === "none") e.bounds = "kill";
        return () => {};
      },
      wander(e, o) {
        const speed = o.speed || 50;
        let t = 0;
        return (dt) => {
          t -= dt;
          if (t <= 0) { t = 0.8 + rng() * 1.5; const a = rng() * Math.PI * 2; e.vx = Math.cos(a) * speed; e.vy = Math.sin(a) * speed; }
          if (e.bounds === "none") e.bounds = "bounce";
        };
      }
    };
    function shooter(e, o) {
      const every = o.every || 0.3;
      let cd = o.delay || 0;
      return (dt) => {
        cd -= dt;
        const mode = o.auto === false ? "action" : (o.auto || true);
        const trigger = mode === true ? true : mode === "held" ? input.held : (input.pressed || input.action);
        if (cd > 0 || !trigger) return;
        cd = every;
        let ang;
        if (o.dir === "aim") ang = Math.atan2(input.y - e.y, input.x - e.x);
        else if (typeof o.dir === "number") ang = o.dir;
        else if (o.dir && typeof o.dir === "object") ang = Math.atan2(o.dir.y - e.y, o.dir.x - e.x);
        else ang = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[o.dir || "up"];
        const speed = o.speed || 520;
        const count = o.spread ? (o.count || 3) : 1;
        for (let i = 0; i < count; i += 1) {
          const a = ang + (count > 1 ? (i - (count - 1) / 2) * o.spread : 0);
          const p = g.spawn(o.type || "bullet", {
            x: e.x + Math.cos(a) * (e.h / 2), y: e.y + Math.sin(a) * (e.h / 2),
            w: o.w || 6, h: o.h || 16, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
            rot: a + Math.PI / 2, color: o.color || "accent", shape: o.shape || "capsule",
            sprite: o.sprite, ttl: o.ttl || 2.5, bounds: "kill", tags: o.tags || [], glow: o.glow || colorOf(o.color || "accent"), pop: false
          });
          if (o.onFire) safe(o.onFire, "shoots.onFire", p);
        }
        if (o.sfx !== false) audio.play(o.sfx || "shoot");
      };
    }

    // ------------------------------------------------------------ collisions
    function overlaps(a, b) {
      if (!a || !b || a.dead || b.dead) return false;
      if (a.shape === "circle" && b.shape === "circle") {
        return Math.hypot(a.x - b.x, a.y - b.y) < ((a.w * a.hitbox) / 2 + (b.w * b.hitbox) / 2);
      }
      const aw = (a.w * a.hitbox) / 2, ah = (a.h * a.hitbox) / 2, bw = (b.w * b.hitbox) / 2, bh = (b.h * b.hitbox) / 2;
      return Math.abs(a.x - b.x) < aw + bw && Math.abs(a.y - b.y) < ah + bh;
    }
    function floorY() {
      if (typeof world.floor === "function") {
        const v = Number(safe(world.floor, "world.floor", g));
        return Number.isFinite(v) ? v : null;
      }
      return world.floor;
    }
    function resolveSolids(e, prevBottom) {
      e.grounded = false;
      const floor = floorY();
      if (floor != null && e.y + e.h / 2 >= floor) {
        e.y = floor - e.h / 2;
        if (e.vy > 0) { if (e.vy > 250) e.squash = 0.2; e.vy = 0; }
        e.grounded = true;
      }
      for (const s of entities) {
        if (s === e || s.dead || !(s.solid || s.tags.has("solid"))) continue;
        const dx = e.x - s.x, dy = e.y - s.y;
        const ox = (e.w + s.w) / 2 - Math.abs(dx), oy = (e.h + s.h) / 2 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        if (s.oneWay) {
          if (e.vy >= 0 && prevBottom <= s.top + 4) {
            e.y = s.top - e.h / 2;
            if (e.vy > 250) e.squash = 0.2;
            e.vy = 0; e.grounded = true;
            e.data.landedOn = s;
          }
          continue;
        }
        if (oy < ox) {
          if (dy < 0) { e.y -= oy; if (e.vy > 0) { if (e.vy > 250) e.squash = 0.2; e.vy = 0; } e.grounded = true; e.data.landedOn = s; }
          else { e.y += oy; if (e.vy < 0) e.vy = 0; }
        } else {
          e.x += dx < 0 ? -ox : ox;
          e.vx = 0;
        }
      }
    }

    // ---------------------------------------------------------------- juice
    function burst(x, y, o) {
      o = o || {};
      const n = Math.min(60, o.count || 12);
      const color = colorOf(o.color, pal.primary);
      for (let i = 0; i < n && particles.length < 400; i += 1) {
        const a = o.angle != null ? o.angle + (rng() - 0.5) * (o.spread || 1) : rng() * Math.PI * 2;
        const sp = (o.speed || 160) * (0.35 + rng() * 0.8);
        particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: (o.life || 0.6) * (0.6 + rng() * 0.6), t: 0,
          size: (o.size || 5) * (0.6 + rng() * 0.8), color: Array.isArray(color) ? color[i % color.length] : color,
          gravity: o.gravity != null ? o.gravity : 300, shape: o.shape || (rng() < 0.5 ? "circle" : "square")
        });
      }
    }
    function floatText(x, y, text, color, size) {
      floats.push({ x, y, text: String(text), color: colorOf(color, "#ffffff"), size: size || 20, t: 0, life: 0.9 });
    }
    function shake(amount, duration) { cam.shakeAmp = Math.max(cam.shakeAmp, amount == null ? 6 : amount); cam.shakeT = Math.max(cam.shakeT, duration || 0.22); }
    function flash(color, alpha) { flashFx = { color: colorOf(color, "#ffffff"), a: alpha != null ? alpha : 0.35 }; }

    // ------------------------------------------------------------ background
    const bg = { sprite: assets.has("environment") ? "environment" : null, deco: style.deco || "stars", speedX: 0, speedY: 0, offX: 0, offY: 0, dots: [] };
    function setupBackground(o) {
      Object.assign(bg, o || {});
      const r = mulberry32(seed + 7);
      bg.dots = [];
      for (let i = 0; i < 46; i += 1) bg.dots.push({ x: r() * 1, y: r() * 1, s: 0.5 + r() * 2.2, d: 0.2 + r() * 0.8, p: r() * 6.28 });
    }
    function drawBackground(t) {
      const W = view.W, H = view.H;
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, pal.bg1);
      grad.addColorStop(1, pal.bg2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      applyView();
      bg.offX += bg.speedX * g.dt;
      bg.offY += bg.speedY * g.dt;
      if (bg.sprite && assets.ready(bg.sprite)) {
        // Cover-fit the image; on an axis that scrolls (background speed or
        // camera), tile it so the view is always fully covered.
        const img = assets.get(bg.sprite);
        const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const w = img.naturalWidth * s, h = img.naturalHeight * s;
        const scrollX = bg.offX + cam.x * 0.3, scrollY = bg.offY + cam.y * 0.3;
        const xs = scrollX ? [0, 1].map((k) => ((((-scrollX) % w) + w) % w) - w + k * w) : [(W - w) / 2];
        const ys = scrollY ? [0, 1].map((k) => ((((-scrollY) % h) + h) % h) - h + k * h) : [(H - h) / 2];
        for (const x of xs) for (const y of ys) ctx.drawImage(img, x, y, w + 0.5, h + 0.5);
        return;
      }
      const deco = bg.deco;
      if (deco === "none") return;
      for (const d of bg.dots) {
        const px = ((((d.x * W - (bg.offX + cam.x * 0.5) * d.d) % W) + W) % W);
        const py = ((((d.y * H - (bg.offY + cam.y * 0.5) * d.d) % H) + H) % H);
        if (deco === "stars") {
          ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(t * 1.3 + d.p));
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(px, py, d.s, d.s);
        } else if (deco === "bubbles") {
          ctx.globalAlpha = 0.18;
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(px, py, d.s * 5, 0, Math.PI * 2); ctx.stroke();
        } else if (deco === "clouds") {
          ctx.globalAlpha = 0.12 + d.d * 0.1;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.ellipse(px, py, 26 * d.s, 9 * d.s, 0, 0, Math.PI * 2); ctx.fill();
        } else if (deco === "dots") {
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = pal.secondary;
          ctx.beginPath(); ctx.arc(px, py, d.s * 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (deco === "grid") {
        ctx.strokeStyle = pal.accent; ctx.globalAlpha = 0.22; ctx.lineWidth = 1;
        const step = 40, oy = ((bg.offY + cam.y * 0.5) % step + step) % step, ox = ((bg.offX + cam.x * 0.5) % step + step) % step;
        for (let y = -oy; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        for (let x = -ox; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      if (deco === "hills") {
        for (let layer = 0; layer < 2; layer += 1) {
          ctx.fillStyle = shade(pal.bg2, layer ? -0.35 : -0.15);
          ctx.beginPath(); ctx.moveTo(0, H);
          const off = (bg.offX + cam.x) * (layer ? 0.5 : 0.25);
          for (let x = 0; x <= W; x += 12) ctx.lineTo(x, H * (layer ? 0.8 : 0.7) + Math.sin((x + off) / (layer ? 60 : 90)) * 26);
          ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
        }
      }
    }

    // ----------------------------------------------------------- rendering
    function applyView() {
      const sx = cam.shakeT > 0 ? (rng() - 0.5) * 2 * cam.shakeAmp : 0;
      const sy = cam.shakeT > 0 ? (rng() - 0.5) * 2 * cam.shakeAmp : 0;
      ctx.setTransform(view.scale, 0, 0, view.scale, view.ox + sx * view.scale, view.oy + sy * view.scale);
    }
    function roundRect(x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function shapePath(shape, w, h) {
      const hw = w / 2, hh = h / 2;
      ctx.beginPath();
      if (shape === "circle") { ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2); }
      else if (shape === "tri") { ctx.moveTo(0, -hh); ctx.lineTo(hw, hh); ctx.lineTo(-hw, hh); ctx.closePath(); }
      else if (shape === "diamond") { ctx.moveTo(0, -hh); ctx.lineTo(hw, 0); ctx.lineTo(0, hh); ctx.lineTo(-hw, 0); ctx.closePath(); }
      else if (shape === "star") {
        for (let i = 0; i < 10; i += 1) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.45 : 1;
          ctx.lineTo(Math.cos(a) * hw * r, Math.sin(a) * hh * r);
        }
        ctx.closePath();
      } else if (shape === "capsule") { roundRect(-hw, -hh, w, h, Math.min(hw, hh)); }
      else if (shape === "blob") { roundRect(-hw, -hh, w, h, Math.min(w, h) * 0.42); }
      else { roundRect(-hw, -hh, w, h, style.radius); }
    }
    function drawShape(e, w, h, fill) {
      shapePath(e.shape, w, h);
      ctx.fillStyle = fill;
      ctx.fill();
      if (style.outlineWidth > 0 && e.shape !== "capsule") {
        ctx.lineWidth = style.outlineWidth; ctx.strokeStyle = style.outline; ctx.stroke();
      }
      if (e.shape !== "capsule" && w > 12 && h > 12) {
        ctx.save();
        shapePath(e.shape, w, h);
        ctx.clip();
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(-w / 2, -h / 2, w, h * 0.32);
        ctx.fillStyle = "rgba(0,0,0,0.14)";
        ctx.fillRect(-w / 2, h * 0.22, w, h * 0.3);
        ctx.restore();
      }
      if (e.face) {
        const ex = w * 0.17, ey = -h * 0.1, er = Math.max(2, Math.min(w, h) * 0.11);
        const look = e.flipX ? -1 : 1;
        for (const s of [-1, 1]) {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(s * ex + look * 2, ey, er, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#15122b";
          ctx.beginPath(); ctx.arc(s * ex + look * (2 + er * 0.35), ey, er * 0.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    function spriteFor(e) {
      if (!e.sprite || !assets.ready(e.sprite)) return null;
      const frames = assets.frames(e.sprite);
      if (frames.length > 1 && (Math.abs(e.vx) + Math.abs(e.vy) > 20 || e.data.animate)) {
        const name = frames[e.frame % frames.length];
        if (assets.ready(name)) return assets.get(name);
      }
      return assets.get(e.sprite);
    }
    function drawEntity(e) {
      const sx = e.fixed ? e.x : e.x - cam.x;
      const sy = e.fixed ? e.y : e.y - cam.y;
      if (sx < -e.w - 60 || sx > view.W + e.w + 60 || sy < -e.h - 60 || sy > view.H + e.h + 60) return;
      if (e.invuln > 0 && Math.floor(e.invuln * 14) % 2 === 0) return;
      if (e.shadow) {
        const floor = floorY();
        const groundY = floor != null ? floor - cam.y : sy + e.h / 2;
        const lift = clamp((groundY - (sy + e.h / 2)) / 200, 0, 0.8);
        ctx.fillStyle = "rgba(0,0,0," + (0.28 * (1 - lift)).toFixed(3) + ")";
        ctx.beginPath(); ctx.ellipse(sx, groundY, (e.w * 0.42) * (1 - lift * 0.5), e.h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.save();
      ctx.globalAlpha = e.alpha;
      ctx.translate(sx, sy);
      if (e.rot) ctx.rotate(e.rot);
      const pop = e.popT > 0 ? 1 + Math.sin((1 - e.popT / 0.22) * Math.PI) * 0.25 - (e.popT / 0.22) * 0.3 : 1;
      const sqx = 1 + e.squash, sqy = 1 - e.squash;
      ctx.scale(e.scale * pop * sqx * (e.flipX ? -1 : 1), e.scale * pop * sqy);
      if (e.glow) { ctx.shadowColor = colorOf(e.glow); ctx.shadowBlur = 14; }
      const img = spriteFor(e);
      if (e.draw) safe(e.draw, "entity.draw(" + e.type + ")", ctx, e, g);
      else if (img) ctx.drawImage(img, -e.w / 2, -e.h / 2, e.w, e.h);
      else drawShape(e, e.w, e.h, colorOf(e.color, e.tags.has("player") ? pal.primary : pal.secondary));
      ctx.shadowBlur = 0;
      if (e.flashT > 0) {
        ctx.globalAlpha = Math.min(1, e.flashT / 0.12) * 0.75;
        shapePath(e.shape === "capsule" ? "capsule" : (img ? "blob" : e.shape), e.w, e.h);
        ctx.fillStyle = "#ffffff"; ctx.fill();
        ctx.globalAlpha = e.alpha;
      }
      if (e.label != null) {
        if (e.flipX) ctx.scale(-1, 1);
        text(e.label, 0, 1, { size: Math.max(10, Math.min(e.h * 0.5, 34)), color: e.labelColor || "#ffffff", align: "center", baseline: "middle" });
      }
      ctx.restore();
    }
    function text(str, x, y, o) {
      o = o || {};
      ctx.font = (o.weight || "800") + " " + (o.size || 18) + "px " + (o.font || style.font);
      ctx.textAlign = o.align || "left";
      ctx.textBaseline = o.baseline || "alphabetic";
      // UI text is always light-on-dark-outline so it reads on any palette or
      // background (a palette's own text/outline colors can be dark or white).
      if (o.stroke !== false) {
        ctx.lineWidth = Math.max(2, (o.size || 18) / 5);
        ctx.strokeStyle = o.strokeColor || "rgba(14,10,32,0.92)";
        ctx.lineJoin = "round";
        ctx.strokeText(String(str), x, y);
      }
      ctx.fillStyle = colorOf(o.color, "#ffffff");
      ctx.fillText(String(str), x, y);
    }
    function wrapLines(str, maxWidth, size) {
      ctx.font = "800 " + size + "px " + style.font;
      const words = String(str).split(/\s+/);
      const lines = [];
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
      }
      if (line) lines.push(line);
      return lines.slice(0, 3);
    }
    function heart(x, y, s, filled) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s / 16, s / 16);
      ctx.beginPath();
      ctx.moveTo(0, 5); ctx.bezierCurveTo(-8, -2, -7, -9, 0, -5); ctx.bezierCurveTo(7, -9, 8, -2, 0, 5);
      ctx.closePath();
      ctx.fillStyle = filled ? pal.danger : "rgba(255,255,255,0.18)"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = style.outline; ctx.stroke();
      ctx.restore();
    }
    function drawHud() {
      if (config.hud === false) return;
      const hud = config.hud || {};
      text(String(g.score), 16, 40, { size: 30 });
      text("BEST " + Math.max(g.best, g.score), 18, 60, { size: 12, color: "rgba(255,255,255,0.8)" });
      let y = 80;
      if (hud.lives !== false && g.maxLives > 0) {
        for (let i = 0; i < Math.min(g.maxLives, 8); i += 1) heart(24 + i * 22, y - 4, 18, i < g.lives);
        y += 24;
      }
      if (hud.level) { text("LEVEL " + g.level, 16, y, { size: 13, color: pal.secondary }); y += 18; }
      for (const key of Object.keys(hudValues)) { text(key + ": " + hudValues[key], 16, y, { size: 13 }); y += 18; }
      for (const b of uiButtons()) {
        ctx.fillStyle = "rgba(0,0,0,0.32)";
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.stroke();
        ctx.fillStyle = "#ffffff";
        if (b.id === "pause") {
          if (state === "paused") { ctx.beginPath(); ctx.moveTo(b.x - 4, b.y - 7); ctx.lineTo(b.x + 7, b.y); ctx.lineTo(b.x - 4, b.y + 7); ctx.fill(); }
          else { ctx.fillRect(b.x - 6, b.y - 7, 4, 14); ctx.fillRect(b.x + 2, b.y - 7, 4, 14); }
        } else {
          ctx.beginPath(); ctx.moveTo(b.x - 8, b.y - 3); ctx.lineTo(b.x - 4, b.y - 3); ctx.lineTo(b.x + 1, b.y - 8); ctx.lineTo(b.x + 1, b.y + 8); ctx.lineTo(b.x - 4, b.y + 3); ctx.lineTo(b.x - 8, b.y + 3); ctx.fill();
          if (audio.muted) { ctx.strokeStyle = pal.danger; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(b.x + 4, b.y - 5); ctx.lineTo(b.x + 10, b.y + 5); ctx.moveTo(b.x + 10, b.y - 5); ctx.lineTo(b.x + 4, b.y + 5); ctx.stroke(); }
          else { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(b.x + 2, b.y, 6, -0.9, 0.9); ctx.stroke(); }
        }
      }
    }
    function overlay(alpha) {
      ctx.fillStyle = "rgba(8,6,20," + alpha + ")";
      ctx.fillRect(-10, -10, view.W + 20, view.H + 20);
    }
    function drawMenu(t) {
      const W = view.W, H = view.H;
      overlay(0.45);
      const title = PKG.title || config.title || "Play"; // the saved title wins (creators rename games)
      const lines = wrapLines(title.toUpperCase(), W - 50, 40);
      const bounce = Math.sin(t * 2.2) * 4;
      lines.forEach((line, i) => text(line, W / 2, H * 0.3 + i * 46 + bounce, { size: 40, align: "center", color: pal.primary }));
      if (config.subtitle) text(config.subtitle, W / 2, H * 0.3 + lines.length * 46 + 6, { size: 15, align: "center", color: pal.secondary });
      const pulse = 1 + Math.sin(t * 5) * 0.06;
      ctx.save(); ctx.translate(W / 2, H * 0.62); ctx.scale(pulse, pulse);
      ctx.fillStyle = pal.accent; roundRect(-92, -26, 184, 52, 26); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = style.outline; ctx.stroke();
      text("TAP TO PLAY", 0, 7, { size: 20, align: "center" });
      ctx.restore();
      const hint = config.hint || (PKG.gameplay && PKG.gameplay.controls) || "";
      if (hint) wrapLines(hint, W - 60, 13).forEach((l, i) => text(l, W / 2, H * 0.74 + i * 18, { size: 13, align: "center", weight: "600", color: "rgba(255,255,255,0.85)" }));
      if (g.best > 0) text("BEST " + g.best, W / 2, H * 0.86, { size: 15, align: "center", color: pal.primary });
    }
    function drawOver() {
      const W = view.W, H = view.H;
      const k = EASE.back(clamp(stateT / 0.45, 0, 1));
      overlay(0.55 * Math.min(1, stateT / 0.3));
      ctx.save(); ctx.translate(W / 2, H * 0.44); ctx.scale(k, k);
      ctx.fillStyle = "rgba(20,16,44,0.92)"; roundRect(-140, -120, 280, 250, 22); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = g.won ? pal.good : pal.accent; ctx.stroke();
      text(g.overTitle || (g.won ? "YOU WIN!" : "GAME OVER"), 0, -70, { size: 32, align: "center", color: g.won ? pal.good : pal.danger });
      const shown = Math.round(g.score * clamp(stateT / 0.8, 0, 1));
      text(String(shown), 0, 0, { size: 54, align: "center" });
      text("SCORE", 0, 22, { size: 12, align: "center", color: "rgba(255,255,255,0.7)" });
      if (g.score > prevBest && g.score > 0) text("NEW BEST!", 0, 56, { size: 18, align: "center", color: pal.primary });
      else text("BEST " + g.best, 0, 56, { size: 15, align: "center", color: "rgba(255,255,255,0.8)" });
      if (stateT > 0.7) text("TAP TO RETRY", 0, 100, { size: 16, align: "center", color: pal.secondary });
      ctx.restore();
    }
    function drawPaused() {
      overlay(0.5);
      text("PAUSED", view.W / 2, view.H * 0.45, { size: 36, align: "center" });
      text("tap to resume", view.W / 2, view.H * 0.45 + 30, { size: 14, align: "center", weight: "600" });
    }

    function render() {
      const t = now() / 1000;
      drawBackground(t);
      applyView();
      safe(hooks.drawBehind, "drawBehind", ctx, g);
      ctx.save();
      const sorted = entities.slice().sort((a, b) => a.z - b.z);
      for (const e of sorted) drawEntity(e);
      ctx.restore();
      for (const p of particles) {
        const k = 1 - p.t / p.life;
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = p.color;
        const px = p.x - cam.x, py = p.y - cam.y, s = p.size * (0.4 + k * 0.6);
        if (p.shape === "circle") { ctx.beginPath(); ctx.arc(px, py, s / 2, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(px - s / 2, py - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      safe(hooks.draw, "draw", ctx, g);
      for (const f of floats) {
        const k = f.t / f.life;
        ctx.globalAlpha = 1 - k * k;
        const s = f.size * (k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - (k - 0.15) * 0.1);
        text(f.text, f.x - cam.x, f.y - cam.y - k * 42, { size: s, align: "center" });
      }
      ctx.globalAlpha = 1;
      if (levelBanner) {
        const k = levelBanner.t / 1.4;
        const x = view.W / 2 + (k < 0.2 ? (1 - k / 0.2) * view.W : k > 0.8 ? -((k - 0.8) / 0.2) * view.W : 0);
        ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(-10, view.H * 0.4 - 34, view.W + 20, 56);
        text(levelBanner.text, x, view.H * 0.4 + 6, { size: 30, align: "center", color: pal.primary });
      }
      if (state === "play" || state === "paused") drawHud();
      if (flashFx && flashFx.a > 0) { ctx.globalAlpha = flashFx.a; ctx.fillStyle = flashFx.color; ctx.fillRect(-10, -10, view.W + 20, view.H + 20); ctx.globalAlpha = 1; }
      if (state === "menu") drawMenu(t);
      else if (state === "over") drawOver();
      else if (state === "paused") drawPaused();
    }

    // ----------------------------------------------------------------- step
    function setState(s) { state = s; stateT = 0; g.state = s; }
    function newRun() {
      entities = []; particles = []; floats = []; tweens = [];
      timers = timers.filter((tm) => tm.permanent);
      for (const tm of timers) tm.acc = 0;
      rules = rules.filter((r) => r.permanent);
      for (const k of Object.keys(hudValues)) delete hudValues[k];
      g.score = 0; g.time = 0; g.level = 1; g.won = false; g.overTitle = null;
      g.lives = g.maxLives; g.data = {};
      cam.x = 0; cam.y = 0; cam.target = null; cam.shakeT = 0; flashFx = null; levelBanner = null;
      bg.speedX = bg.baseSpeedX || 0; bg.speedY = bg.baseSpeedY || 0; bg.offX = 0; bg.offY = 0;
      comboState.n = 0; comboState.t = 0;
      inSetup = true;
      safe(hooks.setup, "setup", g);
      inSetup = false;
    }
    function startPlay() {
      newRun();
      setState("play");
      audio.play("click");
      safe(hooks.onStart, "onStart", g);
    }
    function step(dt) {
      g.dt = dt;
      stateT += dt;
      applyInjected();
      if (state === "menu") {
        if (input.pressed || input.action) startPlay();
      } else if (state === "paused") {
        if (input.pressed || input.action) setState("play");
      } else if (state === "over") {
        if (stateT > 0.7 && (input.pressed || input.action)) startPlay();
      } else if (state === "play") {
        g.time += dt;
        for (const tm of timers.slice()) {
          if (tm.done) continue;
          tm.acc += dt;
          const interval = typeof tm.every === "function" ? Math.max(0.05, Number(safe(tm.every, "every(interval)", g)) || 1) : tm.every;
          if (tm.acc >= interval) {
            tm.acc -= interval;
            safe(tm.fn, tm.once ? "after" : "every", g);
            if (tm.once) tm.done = true;
          }
          if (state !== "play") break;
        }
        timers = timers.filter((tm) => !tm.done);
        if (state === "play") safe(hooks.update, "update", g, dt);
        if (state === "play") updateEntities(dt);
        if (state === "play") runRules();
        entities = entities.filter((e) => !e.dead);
        updateCamera(dt);
        if (comboState.t > 0) { comboState.t -= dt; if (comboState.t <= 0) comboState.n = 0; }
      }
      for (const tw of tweens) {
        tw.t += dt;
        const k = EASE[tw.ease] ? EASE[tw.ease](clamp(tw.t / tw.dur, 0, 1)) : clamp(tw.t / tw.dur, 0, 1);
        for (const key of Object.keys(tw.to)) tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * k;
        if (tw.t >= tw.dur) { tw.done = true; if (tw.onDone) safe(tw.onDone, "tween.onDone", tw.obj); }
      }
      tweens = tweens.filter((tw) => !tw.done);
      for (const p of particles) { p.t += dt; p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.5; }
      particles = particles.filter((p) => p.t < p.life);
      for (const f of floats) f.t += dt;
      floats = floats.filter((f) => f.t < f.life);
      if (cam.shakeT > 0) { cam.shakeT -= dt; if (cam.shakeT <= 0) cam.shakeAmp = 0; }
      if (flashFx) { flashFx.a -= dt * 1.6; if (flashFx.a <= 0) flashFx = null; }
      if (levelBanner) { levelBanner.t += dt; if (levelBanner.t > 1.4) levelBanner = null; }
      endFrameInput();
    }
    function updateEntities(dt) {
      for (const e of entities.slice()) {
        if (e.dead) continue;
        for (const brain of e.brains) safe(brain, "movement(" + e.type + ")", dt);
        const prevBottom = e.y + e.h / 2;
        e.vx += e.ax * dt;
        e.vy += (e.ay + e.gravity) * dt;
        if (e.drag) { e.vx *= Math.max(0, 1 - e.drag * dt); e.vy *= Math.max(0, 1 - e.drag * dt); }
        if (e.maxSpeed) { const sp = Math.hypot(e.vx, e.vy); if (sp > e.maxSpeed) { e.vx *= e.maxSpeed / sp; e.vy *= e.maxSpeed / sp; } }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.body) resolveSolids(e, prevBottom);
        e.rot += e.spin * dt;
        e.age += dt;
        if (e.invuln > 0) e.invuln -= dt;
        if (e.flashT > 0) e.flashT -= dt;
        if (e.popT > 0) e.popT -= dt;
        e.squash = lerp(e.squash, 0, Math.min(1, dt * 10));
        e.animT += dt;
        if (e.animT > 0.11) { e.animT = 0; e.frame += 1; }
        if (e.autoW && e.sprite && assets.ready(e.sprite)) { e.w = e.h * assets.aspect(e.sprite); e.autoW = false; }
        if (e.ttl != null) { e.ttl -= dt; if (e.ttl <= 0) { e.dead = true; continue; } }
        applyBounds(e);
      }
    }
    function applyBounds(e) {
      const W = view.W, H = view.H;
      const left = e.fixed ? 0 : cam.x, top = e.fixed ? 0 : cam.y;
      const b = e.bounds;
      if (b === "clamp" || b === "clampX") {
        e.x = clamp(e.x, left + e.w / 2, left + W - e.w / 2);
        if (b === "clamp") e.y = clamp(e.y, top + e.h / 2, top + H - e.h / 2);
      } else if (b === "wrap" || b === "wrapX") {
        if (e.x < left - e.w / 2) e.x = left + W + e.w / 2; else if (e.x > left + W + e.w / 2) e.x = left - e.w / 2;
        if (b === "wrap") { if (e.y < top - e.h / 2) e.y = top + H + e.h / 2; else if (e.y > top + H + e.h / 2) e.y = top - e.h / 2; }
      } else if (b === "bounce") {
        if (e.x < left + e.w / 2) { e.x = left + e.w / 2; e.vx = Math.abs(e.vx); e.data.bounced = "left"; }
        if (e.x > left + W - e.w / 2) { e.x = left + W - e.w / 2; e.vx = -Math.abs(e.vx); e.data.bounced = "right"; }
        if (e.y < top + e.h / 2) { e.y = top + e.h / 2; e.vy = Math.abs(e.vy); e.data.bounced = "top"; }
        if (e.y > top + H - e.h / 2 && !e.data.noBottomBounce) { e.y = top + H - e.h / 2; e.vy = -Math.abs(e.vy); e.data.bounced = "bottom"; }
      } else if (b === "kill") {
        const m = Math.max(e.w, e.h) + 20;
        if (e.x < left - m || e.x > left + W + m || e.y < top - m || e.y > top + H + m) e.dead = true;
      }
      if (!e.keep && !e.fixed && b !== "clamp" && (e.x < left - W * 1.5 || e.x > left + W * 2.5 || e.y < top - H * 2 || e.y > top + H * 2)) e.dead = true;
    }
    function runRules() {
      const byTag = new Map();
      for (const e of entities) {
        if (e.dead) continue;
        for (const t of e.tags) { if (!byTag.has(t)) byTag.set(t, []); byTag.get(t).push(e); }
      }
      for (const rule of rules.slice()) {
        const listA = byTag.get(rule.a) || [], listB = byTag.get(rule.b) || [];
        for (const a of listA) {
          if (a.dead) continue;
          for (const b of listB) {
            if (a === b || b.dead || a.dead) continue;
            if (overlaps(a, b)) {
              safe(rule.fn, "onHit(" + rule.a + "," + rule.b + ")", a, b);
              if (state !== "play") return;
            }
          }
        }
      }
    }
    function updateCamera(dt) {
      const t = cam.target;
      if (!t || t.dead) return;
      const o = cam.opts;
      if (o.x) { const tx = t.x - view.W * (o.anchorX != null ? o.anchorX : 0.5); cam.x = lerp(cam.x, tx, Math.min(1, dt * (o.lerp || 8))); }
      if (o.y) {
        const ty = t.y - view.H * (o.anchorY != null ? o.anchorY : 0.5);
        if (!o.onlyUp || ty < cam.y) cam.y = lerp(cam.y, ty, Math.min(1, dt * (o.lerp || 8)));
      }
    }

    // ---------------------------------------------------------------- API
    const comboState = { n: 0, t: 0 };
    const g = {
      W: 360, H: 640, time: 0, dt: 1 / 60, score: 0, lives: 0, maxLives: 0, level: 1, state: "boot", won: false,
      best: store.get(bestKey, 0), data: {}, pal, style, input, assets, canvas, ctx, errors, seed, camera: cam, bg,
      EASE, clamp, lerp, shade,
      rand: () => rng(),
      range: (a, b) => a + rng() * (b - a),
      randInt: (a, b) => a + Math.floor(rng() * (b - a + 1)),
      pick: (arr) => (arr && arr.length ? arr[Math.floor(rng() * arr.length)] : undefined),
      chance: (p) => rng() < p,
      dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
      color: (c) => colorOf(c),
      setup(fn) { hooks.setup = fn; if (started && state !== "play") newRun(); return g; },
      update(fn) { hooks.update = fn; return g; },
      draw(fn) { hooks.draw = fn; return g; },
      drawBehind(fn) { hooks.drawBehind = fn; return g; },
      onLevel(fn) { hooks.onLevel = fn; return g; },
      onStart(fn) { hooks.onStart = fn; return g; },
      onOver(fn) { hooks.onOver = fn; return g; },
      spawn(type, opts) {
        const e = new Entity(String(type || "thing"), opts);
        entities.push(e);
        return e;
      },
      all(tag) { return entities.filter((e) => !e.dead && e.tags.has(tag)); },
      first(tag) { return entities.find((e) => !e.dead && e.tags.has(tag)) || null; },
      count(tag) { let n = 0; for (const e of entities) if (!e.dead && e.tags.has(tag)) n += 1; return n; },
      clear(tag) { for (const e of entities) if (!tag || e.tags.has(tag)) e.dead = true; },
      onHit(a, b, fn) { rules.push({ a, b, fn, permanent: !inSetup }); return g; },
      overlaps,
      every(seconds, fn) { const tm = { every: seconds, fn, acc: 0, permanent: !inSetup }; timers.push(tm); return { cancel() { tm.done = true; } }; },
      after(seconds, fn) { const tm = { every: seconds, fn, acc: 0, once: true, permanent: false }; timers.push(tm); return { cancel() { tm.done = true; } }; },
      ramp(from, to, seconds) { return lerp(from, to, clamp(g.time / (seconds || 60), 0, 1)); },
      lane(index, lanes) { const n = lanes || 3; return ((index + 0.5) * view.W) / n; },
      addScore(n, x, y, opts) {
        n = Math.round(Number(n) || 0);
        let mult = 1;
        if (opts && opts.combo) { comboState.n += 1; comboState.t = 1.6; mult = Math.min(8, 1 + Math.floor(comboState.n / 3)); }
        g.score += n * mult;
        if (x != null && y != null) floatText(x, y, "+" + n * mult + (mult > 1 ? " x" + mult : ""), mult > 1 ? "primary" : null, mult > 1 ? 24 : 20);
        return g.score;
      },
      combo() { return comboState.n; },
      loseLife(opts) {
        if (state !== "play") return g.lives;
        g.lives -= 1;
        shake(8, 0.3); flash("danger", 0.3); audio.play("hit");
        if (g.lives <= 0) g.over(opts);
        return g.lives;
      },
      gainLife() { g.lives = Math.min(g.maxLives || g.lives + 1, g.lives + 1); audio.play("power"); return g.lives; },
      over(opts) {
        if (state !== "play") return;
        opts = opts || {};
        g.won = Boolean(opts.win);
        g.overTitle = opts.title || null;
        prevBest = g.best;
        if (g.score > g.best) { g.best = g.score; store.set(bestKey, g.best); }
        audio.play(g.won ? "win" : "lose");
        if (!g.won) shake(10, 0.35);
        setState("over");
        safe(hooks.onOver, "onOver", g);
        try { if (typeof root.reportScore === "function") root.reportScore(g.score); } catch (e) { /* platform hook */ }
      },
      win(opts) { g.over(Object.assign({}, opts || {}, { win: true })); },
      nextLevel() {
        g.level += 1;
        levelBanner = { text: "LEVEL " + g.level, t: 0 };
        audio.play("level"); flash("primary", 0.2);
        safe(hooks.onLevel, "onLevel", g, g.level);
        return g.level;
      },
      burst, floatText, shake, flash,
      sfx(name) { audio.play(name); },
      tween(obj, to, duration, ease, onDone) {
        const from = {};
        for (const key of Object.keys(to)) from[key] = Number(obj[key]) || 0;
        tweens.push({ obj, from, to, dur: duration || 0.3, t: 0, ease: ease || "out", onDone });
        return g;
      },
      follow(entity, opts) { cam.target = entity; cam.opts = Object.assign({ x: false, y: true }, opts || {}); return g; },
      background(opts) {
        setupBackground(opts);
        bg.baseSpeedX = bg.speedX || 0; bg.baseSpeedY = bg.speedY || 0;
        return g;
      },
      hud: { set(key, value) { hudValues[key] = value; }, remove(key) { delete hudValues[key]; } },
      text(str, x, y, opts) { text(str, x, y, opts); },
      screen(entity) { return { x: entity.x - cam.x, y: entity.y - cam.y }; },
      world(x, y) { return { x: x + cam.x, y: y + cam.y }; }
    };
    g.maxLives = config.lives != null ? config.lives : ((config.hud && config.hud.lives) || 0);
    g.lives = g.maxLives;
    root.__KULT_GAME__ = g;

    // ----------------------------------------------------------- lifecycle
    function loop() {
      const t = now();
      const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
      lastT = t;
      try { step(dt); render(); } catch (error) { recordError(error, "frame"); }
      if (!manual && root.requestAnimationFrame) root.requestAnimationFrame(loop);
    }
    function boot() {
      if (started) return;
      started = true;
      resize();
      setupBackground(config.background || {});
      bg.baseSpeedX = bg.speedX || 0; bg.baseSpeedY = bg.speedY || 0;
      bindInput();
      newRun();
      setState("menu");
      lastT = now();
      if (!manual && root.requestAnimationFrame) root.requestAnimationFrame(loop);
      else render();
    }
    // Let the game code register setup/update/onHit after KULT.game() returns.
    Promise.resolve().then(boot);

    root.__KULT_TEST__ = {
      get state() { return state; },
      get score() { return g.score; },
      get lives() { return g.lives; },
      get time() { return g.time; },
      get level() { return g.level; },
      get errors() { return errors.slice(); },
      get entityCount() { return entities.length; },
      count: (tag) => g.count(tag),
      types() { const out = {}; for (const e of entities) out[e.type] = (out[e.type] || 0) + 1; return out; },
      boot,
      start() { if (state !== "play") startPlay(); },
      tap(x, y) { injected.push({ type: "down", x: x != null ? x : view.W / 2, y: y != null ? y : view.H * 0.6 }); injected.push({ type: "up", x: x != null ? x : view.W / 2, y: y != null ? y : view.H * 0.6, delay: true }); },
      down(x, y) { injected.push({ type: "down", x, y }); },
      up(x, y) { injected.push({ type: "up", x, y }); },
      key(code) { injected.push({ type: "keydown", code }); },
      keyUp(code) { injected.push({ type: "keyup", code }); },
      swipe(dir) { injected.push({ type: "swipe", dir }); },
      step(frames, dt) {
        const n = frames || 1;
        for (let i = 0; i < n; i += 1) {
          try {
            step(dt || 1 / 60);
            if (i === n - 1) render();
          } catch (error) { recordError(error, "frame"); }
        }
      },
      render() { try { render(); } catch (error) { recordError(error, "render"); } },
      view: () => ({ W: view.W, H: view.H })
    };
    return g;
  }

  root.KULT = { version: 1, game, EASE, shade };
})(typeof window !== "undefined" ? window : globalThis);
