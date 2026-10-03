// Recipe: match3 — swap neighbouring gems, clear lines of 3+, cascades, move limit.
const TUNING = { cols: 7, rows: 8, kinds: 5, moves: 25, target: 1200, targetGrowth: 1.7, bonusMoves: 12 };
const KINDS = ["gem_red", "gem_blue", "gem_green", "gem_yellow", "gem_purple", "gem_orange"];
const COLORS = ["danger", "secondary", "good", "primary", "accent", "#ff9b3d"];
const SHAPES = ["diamond", "circle", "hex", "star", "tri", "square"];

const g = KULT.game({
  title: "Gem Cascade",
  hint: "Tap a gem, then a neighbour to swap (or swipe). Match 3 or more!",
  lives: 0,
  background: { deco: "dots" },
  hud: { level: true }
});

function randomKind(g) { return g.randInt(0, TUNING.kinds - 1); }

function drawGem(ctx, g, kind, x, y, size, alpha) {
  if (g.sprite(KINDS[kind], x, y, size, size, { alpha })) return;
  const r = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= alpha == null ? 1 : alpha;
  ctx.beginPath();
  const shape = SHAPES[kind];
  if (shape === "circle") ctx.arc(0, 0, r, 0, Math.PI * 2);
  else if (shape === "diamond") { ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); }
  else if (shape === "tri") { ctx.moveTo(0, -r); ctx.lineTo(r, r * 0.8); ctx.lineTo(-r, r * 0.8); }
  else if (shape === "square") { ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); }
  else if (shape === "star") { for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r * 0.48 : r; ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); } }
  else { for (let i = 0; i < 6; i += 1) { const a = (i * Math.PI) / 3; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
  ctx.closePath();
  ctx.fillStyle = g.color(COLORS[kind]);
  ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(14,10,32,0.9)"; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.25, r * 0.15, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function findMatches(grid) {
  const hit = new Set();
  for (let r = 0; r < grid.rows; r += 1) {
    let run = 1;
    for (let c = 1; c <= grid.cols; c += 1) {
      const same = c < grid.cols && grid.get(c, r) != null && grid.get(c, r) === grid.get(c - 1, r);
      if (same) run += 1;
      else { if (run >= 3) for (let k = 1; k <= run; k += 1) hit.add(`${c - k},${r}`); run = 1; }
    }
  }
  for (let c = 0; c < grid.cols; c += 1) {
    let run = 1;
    for (let r = 1; r <= grid.rows; r += 1) {
      const same = r < grid.rows && grid.get(c, r) != null && grid.get(c, r) === grid.get(c, r - 1);
      if (same) run += 1;
      else { if (run >= 3) for (let k = 1; k <= run; k += 1) hit.add(`${c},${r - k}`); run = 1; }
    }
  }
  return [...hit].map((s) => s.split(",").map(Number));
}

function hasMove(grid) {
  for (let r = 0; r < grid.rows; r += 1) {
    for (let c = 0; c < grid.cols; c += 1) {
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        if (!grid.inside(c + dc, r + dr)) continue;
        const a = grid.get(c, r), b = grid.get(c + dc, r + dr);
        grid.set(c, r, b); grid.set(c + dc, r + dr, a);
        const ok = findMatches(grid).length > 0;
        grid.set(c, r, a); grid.set(c + dc, r + dr, b);
        if (ok) return true;
      }
    }
  }
  return false;
}

function fillBoard(g) {
  const grid = g.data.grid;
  do {
    grid.fillWith(() => randomKind(g));
    let guard = 0;
    while (findMatches(grid).length && guard < 50) {
      for (const [c, r] of findMatches(grid)) grid.set(c, r, randomKind(g));
      guard += 1;
    }
  } while (!hasMove(grid));
  g.data.offsets = new Array(grid.cols * grid.rows).fill(0).map((_, i) => -(grid.rows - Math.floor(i / grid.cols)) * grid.cell * 0.6);
}

function trySwap(g, a, b) {
  const grid = g.data.grid;
  if (Math.abs(a.c - b.c) + Math.abs(a.r - b.r) !== 1) return false;
  const va = grid.get(a.c, a.r), vb = grid.get(b.c, b.r);
  grid.set(a.c, a.r, vb); grid.set(b.c, b.r, va);
  if (!findMatches(grid).length) {
    grid.set(a.c, a.r, va); grid.set(b.c, b.r, vb);
    g.shake(3, 0.12); g.sfx("hit");
    return true;
  }
  g.data.moves -= 1;
  g.data.combo = 0;
  g.data.busy = 0.12;
  g.sfx("pop");
  return true;
}

function resolveStep(g) {
  const grid = g.data.grid;
  const matches = findMatches(grid);
  if (!matches.length) {
    g.data.busy = 0;
    if (!hasMove(grid)) { g.floatText(g.W / 2, grid.y - 20, "SHUFFLE!", "secondary", 22); fillBoard(g); }
    return;
  }
  g.data.combo += 1;
  const points = matches.length * 10 * g.data.combo;
  for (const [c, r] of matches) {
    const p = grid.toPx(c, r);
    g.burst(p.x, p.y, { color: COLORS[grid.get(c, r)] ?? "primary", count: 6, speed: 140, size: 4 });
    grid.set(c, r, null);
  }
  const center = grid.toPx(matches[0][0], matches[0][1]);
  g.addScore(points, center.x, center.y, { combo: g.data.combo > 1 });
  g.sfx(g.data.combo > 1 ? "power" : "coin");
  if (g.data.combo > 2) g.shake(4, 0.15);
  // Gravity + refill: gems fall into gaps and new ones drop in from above.
  for (let c = 0; c < grid.cols; c += 1) {
    let write = grid.rows - 1;
    for (let r = grid.rows - 1; r >= 0; r -= 1) {
      const v = grid.get(c, r);
      if (v == null) continue;
      if (write !== r) { grid.set(c, write, v); grid.set(c, r, null); g.data.offsets[write * grid.cols + c] = -(write - r) * (grid.cell + grid.gap); }
      write -= 1;
    }
    for (let r = write; r >= 0; r -= 1) {
      grid.set(c, r, randomKind(g));
      g.data.offsets[r * grid.cols + c] = -(write + 1) * (grid.cell + grid.gap) - grid.cell;
    }
  }
  g.data.busy = 0.32;
}

g.setup((g) => {
  g.data.grid = g.grid({ cols: TUNING.cols, rows: TUNING.rows, gap: 3, offsetY: 36 });
  g.data.moves = TUNING.moves;
  g.data.target = TUNING.target;
  g.data.sel = null;
  g.data.busy = 0;
  g.data.combo = 0;
  fillBoard(g);
});

g.update((g, dt) => {
  const grid = g.data.grid;
  for (let i = 0; i < g.data.offsets.length; i += 1) g.data.offsets[i] *= Math.max(0, 1 - dt * 12);
  g.hud.set("Moves", g.data.moves);
  g.hud.set("Goal", g.data.target);

  if (g.data.busy > 0) {
    g.data.busy -= dt;
    if (g.data.busy <= 0) resolveStep(g);
    return;
  }
  if (g.score >= g.data.target) {
    g.nextLevel();
    g.data.target = Math.round(g.data.target * TUNING.targetGrowth);
    g.data.moves += TUNING.bonusMoves;
    g.floatText(g.W / 2, grid.y - 24, `+${TUNING.bonusMoves} MOVES`, "good", 22);
  }
  if (g.data.moves <= 0) { g.over({ title: "OUT OF MOVES" }); return; }

  if (g.input.swipe) {
    const from = grid.cellAt(g.input.startX, g.input.startY);
    const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[g.input.swipe];
    if (from && d && grid.inside(from.c + d[0], from.r + d[1])) { trySwap(g, from, { c: from.c + d[0], r: from.r + d[1] }); g.data.sel = null; return; }
  }
  for (const tap of g.input.taps) {
    const cell = grid.cellAt(tap.x, tap.y);
    if (!cell) { g.data.sel = null; continue; }
    if (g.data.sel && trySwap(g, g.data.sel, cell)) { g.data.sel = null; continue; }
    g.data.sel = cell;
    g.sfx("click");
  }
});

g.draw((ctx, g) => {
  const grid = g.data.grid;
  grid.draw(ctx);
  ctx.save();
  ctx.beginPath(); ctx.rect(grid.x - 4, grid.y - 4, grid.w + 8, grid.h + 8); ctx.clip();
  grid.each((v, c, r) => {
    if (v == null) return;
    const p = grid.toPx(c, r);
    const sel = g.data.sel && g.data.sel.c === c && g.data.sel.r === r;
    const pulse = sel ? 1 + Math.sin(g.time * 12) * 0.08 : 1;
    if (sel) { ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(p.x - grid.cell / 2, p.y - grid.cell / 2, grid.cell, grid.cell); }
    drawGem(ctx, g, v, p.x, p.y + g.data.offsets[r * grid.cols + c], grid.cell * 0.78 * pulse);
  });
  ctx.restore();
});
