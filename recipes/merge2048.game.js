// Recipe: merge2048 — swipe to slide all tiles, equal tiles merge and double.
const TUNING = { size: 4, fourChance: 0.12, slideSpeed: 18 };
const MILESTONES = [128, 256, 512, 1024, 2048, 4096];

const g = KULT.game({
  title: "Merge Rush 2048",
  hint: "Swipe (or arrow keys) to slide the tiles. Equal tiles merge!",
  lives: 0,
  background: { deco: "dots" },
  hud: { level: false }
});

const TILE_COLORS = ["#eee4da", "#ede0c8", "#f2b179", "#f59563", "#f67c5f", "#f65e3b", "#edcf72", "#edcc61", "#edc850", "#edc53f", "#edc22e", "#3c3a32"];

function tileColor(v) { return TILE_COLORS[Math.min(TILE_COLORS.length - 1, Math.log2(v) - 1)]; }

function spawnTile(g) {
  const free = [];
  for (let r = 0; r < TUNING.size; r += 1) for (let c = 0; c < TUNING.size; c += 1) if (!g.data.tiles.some((t) => !t.dying && t.c === c && t.r === r)) free.push({ c, r });
  if (!free.length) return false;
  const spot = g.pick(free);
  const p = g.data.grid.toPx(spot.c, spot.r);
  g.data.tiles.push({ c: spot.c, r: spot.r, x: p.x, y: p.y, v: g.chance(TUNING.fourChance) ? 4 : 2, pop: 0.25 });
  return true;
}

function canMove(g) {
  const at = (c, r) => g.data.tiles.find((t) => !t.dying && t.c === c && t.r === r);
  for (let r = 0; r < TUNING.size; r += 1) {
    for (let c = 0; c < TUNING.size; c += 1) {
      const t = at(c, r);
      if (!t) return true;
      const right = at(c + 1, r), down = at(c, r + 1);
      if ((right && right.v === t.v) || (down && down.v === t.v)) return true;
    }
  }
  return false;
}

function slide(g, dir) {
  const n = TUNING.size;
  const vec = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
  if (!vec) return;
  const live = g.data.tiles.filter((t) => !t.dying);
  let moved = false;
  for (let line = 0; line < n; line += 1) {
    // Tiles on this row/column, ordered from the edge they slide toward.
    const tiles = live.filter((t) => (vec[0] ? t.r === line : t.c === line))
      .sort((a, b) => (vec[0] ? (a.c - b.c) * -vec[0] : (a.r - b.r) * -vec[1]));
    let pos = 0;
    let last = null;
    for (const t of tiles) {
      if (last && last.v === t.v && !last.merged) {
        // Merge: t slides into last and disappears; last doubles.
        t.c = last.c; t.r = last.r; t.dying = true;
        last.v *= 2; last.merged = true; last.pop = 0.22;
        g.addScore(last.v, g.data.grid.toPx(last.c, last.r).x, g.data.grid.toPx(last.c, last.r).y);
        if (MILESTONES.includes(last.v)) { g.nextLevel(); g.floatText(g.W / 2, g.data.grid.y - 30, `${last.v}!`, "primary", 30); }
        moved = true;
        continue;
      }
      const c = vec[0] ? (vec[0] < 0 ? pos : n - 1 - pos) : t.c;
      const r = vec[1] ? (vec[1] < 0 ? pos : n - 1 - pos) : t.r;
      if (c !== t.c || r !== t.r) moved = true;
      t.c = c; t.r = r;
      last = t;
      pos += 1;
    }
  }
  for (const t of g.data.tiles) t.merged = false;
  if (moved) {
    g.sfx("pop");
    g.data.spawnIn = 0.1;
  } else {
    g.shake(2, 0.1);
  }
}

g.setup((g) => {
  g.data.grid = g.grid({ cols: TUNING.size, rows: TUNING.size, gap: 8, offsetY: 30 });
  g.data.tiles = [];
  g.data.spawnIn = 0;
  spawnTile(g); spawnTile(g);
});

g.update((g, dt) => {
  const grid = g.data.grid;
  for (const t of g.data.tiles) {
    const p = grid.toPx(t.c, t.r);
    t.x = g.lerp(t.x, p.x, Math.min(1, dt * TUNING.slideSpeed));
    t.y = g.lerp(t.y, p.y, Math.min(1, dt * TUNING.slideSpeed));
    if (t.pop > 0) t.pop -= dt;
  }
  g.data.tiles = g.data.tiles.filter((t) => !(t.dying && Math.hypot(t.x - grid.toPx(t.c, t.r).x, t.y - grid.toPx(t.c, t.r).y) < 2));
  if (g.data.spawnIn > 0) {
    g.data.spawnIn -= dt;
    if (g.data.spawnIn <= 0) {
      spawnTile(g);
      if (!canMove(g)) g.after(0.5, () => g.over({ title: "NO MOVES LEFT" }));
    }
    return;
  }
  if (g.input.swipe) slide(g, g.input.swipe);
});

g.draw((ctx, g) => {
  const grid = g.data.grid;
  grid.draw(ctx, { cell: "rgba(255,255,255,0.12)" });
  const ordered = g.data.tiles.slice().sort((a, b) => (a.dying ? -1 : 0) - (b.dying ? -1 : 0));
  for (const t of ordered) {
    const s = grid.cell * (1 + (t.pop > 0 ? Math.sin((t.pop / 0.25) * Math.PI) * 0.12 : 0));
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.beginPath();
    const r = s * 0.14, h = s / 2;
    ctx.moveTo(-h + r, -h); ctx.arcTo(h, -h, h, h, r); ctx.arcTo(h, h, -h, h, r); ctx.arcTo(-h, h, -h, -h, r); ctx.arcTo(-h, -h, h, -h, r);
    ctx.fillStyle = tileColor(t.v); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(14,10,32,0.6)"; ctx.stroke();
    ctx.restore();
    const digits = String(t.v).length;
    g.text(String(t.v), t.x, t.y + 1, { font: "display", size: Math.max(14, s * (digits <= 2 ? 0.46 : digits === 3 ? 0.38 : 0.3)), align: "center", baseline: "middle", color: t.v <= 4 ? "#5b4a3a" : "#ffffff", stroke: t.v > 4, shadow: false });
  }
});
