// Recipe: blocks — falling tetromino puzzle on a 10x20 well. Swipe or arrows
// left/right to move, tap (or up) to rotate, swipe down to drop; buttons under
// the well do the same. Full rows clear (1/2/3/4 rows: 100/300/500/800 x level),
// every 10 lines is a level and pieces fall faster. Ghost piece, next preview,
// wall kicks. Stacking out at the top ends the run.
const TUNING = { cols: 10, rows: 20, startFall: 0.8, minFall: 0.08, fallMult: 0.84, linesPerLevel: 10, lineScore: [0, 100, 300, 500, 800], lockDelay: 0.45 };
const SHAPES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]]
};
const COLORS = { I: "#3fd8ff", O: "#ffd84a", T: "#b06bff", S: "#5dff8f", Z: "#ff5a6a", J: "#4f7dff", L: "#ff9b3d" };

const g = KULT.game({
  hero: (ctx, g, s) => { const q = s * 0.34; for (const [x, y] of SHAPES.T) block(ctx, g, "T", (x - 1.5) * q, (y - 1) * q, q); },
  title: "Block Drop",
  hint: "Swipe to move, tap to rotate, swipe down to drop. Clear full rows!",
  lives: 0,
  background: { deco: "grid" },
  hud: { level: true }
});

function bag(g) {
  const kinds = Object.keys(SHAPES);
  for (let i = kinds.length - 1; i > 0; i -= 1) { const j = g.randInt(0, i); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  return kinds;
}

function nextKind(g) {
  if (!g.data.bag.length) g.data.bag = bag(g);
  return g.data.bag.pop();
}

function cellsOf(p) {
  const size = p.kind === "I" ? 4 : p.kind === "O" ? 4 : 3;
  return SHAPES[p.kind].map(([x, y]) => {
    let cx = x, cy = y;
    for (let k = 0; k < (p.rot & 3); k += 1) { const t = cx; cx = size - 1 - cy; cy = t; if (p.kind === "O") { cx = x; cy = y; } }
    return [p.x + cx, p.y + cy];
  });
}

function fits(g, p) {
  return cellsOf(p).every(([c, r]) => c >= 0 && c < TUNING.cols && r < TUNING.rows && (r < 0 || !g.data.well[r * TUNING.cols + c]));
}

function spawn(g) {
  const kind = g.data.next;
  g.data.next = nextKind(g);
  g.data.piece = { kind, rot: 0, x: 3, y: -1 };
  g.data.lockT = 0;
  if (!fits(g, g.data.piece)) {
    g.data.dead = true;
    g.shake(8, 0.4); g.sfx("lose");
    g.after(0.6, () => g.over({ title: "STACKED OUT!" }));
  }
}

function tryMove(g, dx, dy, drot) {
  const p = g.data.piece;
  if (!p) return false;
  const kicks = drot ? [0, -1, 1, -2, 2] : [0];
  for (const k of kicks) {
    const cand = { ...p, x: p.x + dx + k, y: p.y + dy, rot: p.rot + (drot || 0) };
    if (fits(g, cand)) { g.data.piece = cand; if (dy === 0) g.data.lockT = 0; return true; }
  }
  return false;
}

function lock(g) {
  const p = g.data.piece, well = g.data.well, C = TUNING.cols;
  for (const [c, r] of cellsOf(p)) if (r >= 0) well[r * C + c] = p.kind;
  if (cellsOf(p).some(([, r]) => r < 0)) { g.data.piece = null; g.data.dead = true; g.sfx("lose"); g.after(0.6, () => g.over({ title: "STACKED OUT!" })); return; }
  const full = [];
  for (let r = 0; r < TUNING.rows; r += 1) if (well.slice(r * C, r * C + C).every(Boolean)) full.push(r);
  g.sfx(full.length ? "coin" : "bounce");
  if (full.length) {
    const grid = g.data.grid;
    for (const r of full) {
      for (let c = 0; c < C; c += 1) { const q = grid.toPx(c, r); if (c % 2 === 0) g.burst(q.x, q.y, { color: COLORS[well[r * C + c]] || "accent", count: 4, speed: 120 }); }
      well.splice(r * C, C);
      well.unshift(...new Array(C).fill(null));
    }
    const pts = TUNING.lineScore[full.length] * g.level;
    const q = grid.toPx(C / 2, full[0]);
    g.addScore(pts, q.x, q.y, { combo: true });
    if (full.length === 4) { g.floatText(g.W / 2, q.y - 30, "QUAD!", "accent", 28); g.shake(6, 0.25); g.flash("accent", 0.2); g.sfx("power"); }
    g.data.lines += full.length;
    if (g.data.lines >= g.level * TUNING.linesPerLevel) { g.nextLevel(); g.data.fall = Math.max(TUNING.minFall, g.data.fall * TUNING.fallMult); }
  }
  spawn(g);
}

function hardDrop(g) {
  let n = 0;
  while (tryMove(g, 0, 1, 0)) n += 1;
  g.addScore(n * 2);
  g.shake(3, 0.1);
  lock(g);
}

g.setup((g) => {
  g.data.grid = g.grid({ cols: TUNING.cols, rows: TUNING.rows, gap: 0, offsetY: -30, heightFrac: 0.7 });
  g.data.well = new Array(TUNING.cols * TUNING.rows).fill(null);
  g.data.bag = [];
  g.data.next = nextKind(g);
  g.data.fall = TUNING.startFall;
  g.data.clock = 0;
  g.data.lines = 0;
  g.data.dead = false;
  spawn(g);
});

g.update((g, dt) => {
  g.hud.set("Lines", g.data.lines);
  if (g.data.dead || !g.data.piece) return;
  const b = g.input.button;
  if (b === "left" || g.input.swipe === "left") { if (tryMove(g, -1, 0, 0)) g.sfx("click"); }
  else if (b === "right" || g.input.swipe === "right") { if (tryMove(g, 1, 0, 0)) g.sfx("click"); }
  else if (b === "rotate" || g.input.swipe === "up") { if (tryMove(g, 0, 0, 1)) g.sfx("pop"); }
  else if (b === "drop" || g.input.swipe === "down") { hardDrop(g); return; }
  else if (g.input.taps.length && !b) { if (tryMove(g, 0, 0, 1)) g.sfx("pop"); }
  if (g.data.dead || !g.data.piece) return;
  const soft = g.input.key("ArrowDown") || g.input.key("KeyS");
  g.data.clock += dt * (soft ? 12 : 1);
  if (g.data.clock >= g.data.fall) {
    g.data.clock = 0;
    if (!tryMove(g, 0, 1, 0)) {
      g.data.lockT += g.data.fall;
      if (g.data.lockT >= TUNING.lockDelay) lock(g);
    } else if (soft) g.addScore(1);
  }
});

function block(ctx, g, kind, x, y, s, alpha) {
  if (g.sprite(`block_${kind.toLowerCase()}`, x + s / 2, y + s / 2, s, s, { alpha })) return;
  const base = COLORS[kind];
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.fillStyle = base; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
  ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(x + 1, y + 1, s - 2, 3); ctx.fillRect(x + 1, y + 1, 3, s - 2);
  ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(x + 1, y + s - 4, s - 2, 3); ctx.fillRect(x + s - 4, y + 1, 3, s - 2);
  ctx.globalAlpha = 1;
}

g.draw((ctx, g) => {
  const grid = g.data.grid, s = grid.cell, C = TUNING.cols;
  g.panel(grid.x - 6, grid.y - 6, grid.w + 12, grid.h + 12, { r: 10, fill: "rgba(8,6,22,0.7)" });
  ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
  for (let c = 1; c < C; c += 1) { ctx.beginPath(); ctx.moveTo(grid.x + c * s, grid.y); ctx.lineTo(grid.x + c * s, grid.y + grid.h); ctx.stroke(); }
  for (let r = 0; r < TUNING.rows; r += 1) for (let c = 0; c < C; c += 1) { const k = g.data.well[r * C + c]; if (k) block(ctx, g, k, grid.x + c * s, grid.y + r * s, s); }
  const p = g.data.piece;
  if (p && !g.data.dead) {
    let ghost = { ...p };
    while (fits(g, { ...ghost, y: ghost.y + 1 })) ghost = { ...ghost, y: ghost.y + 1 };
    for (const [c, r] of cellsOf(ghost)) if (r >= 0) block(ctx, g, p.kind, grid.x + c * s, grid.y + r * s, s, 0.22);
    for (const [c, r] of cellsOf(p)) if (r >= 0) block(ctx, g, p.kind, grid.x + c * s, grid.y + r * s, s);
  }
  // Next piece preview, right of the well.
  const px = grid.x + grid.w + 12, py = grid.y + 6, ps = Math.min(12, (g.W - px - 6) / 4.2);
  if (ps > 6) {
    g.text("NEXT", px + ps * 2, py, { size: 11, color: "text", align: "center", font: "ui" });
    for (const [x, y] of SHAPES[g.data.next]) block(ctx, g, g.data.next, px + x * ps, py + 12 + y * ps, ps);
  }
  const by = grid.y + grid.h + 34, bw = 72, gap = 10, x0 = g.W / 2 - (bw * 4 + gap * 3) / 2 + bw / 2;
  [["left", "◀"], ["rotate", "⟳"], ["right", "▶"], ["drop", "▼"]].forEach(([id, label], i) => g.button(id, { x: x0 + i * (bw + gap), y: by, w: bw, h: 46, label, color: id === "drop" ? "accent" : "secondary", size: 22 }));
});
