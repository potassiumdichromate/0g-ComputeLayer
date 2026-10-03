// Recipe: sokoban — push every crate onto a goal; undo and reset buttons.
// Map legend: # wall, . goal, $ crate, * crate on goal, @ player, space floor.
const LEVELS = [
  ["#######", "#     #", "# $ . #", "#  @  #", "#######"],
  ["#######", "#.    #", "#  $  #", "#  @  #", "#   $.#", "#######"],
  ["########", "#  #   #", "# $  $ #", "#. ## .#", "#   @  #", "########"]
];

const g = KULT.game({
  title: "Crate Pusher",
  hint: "Swipe or use arrows to walk. Push every crate onto a glowing goal.",
  lives: 0,
  background: { deco: "dots" },
  hud: { level: true }
});

function loadLevel(g, index) {
  const map = LEVELS[index];
  const rows = map.length, cols = Math.max(...map.map((l) => l.length));
  const grid = g.grid({ cols, rows, offsetY: 10, heightFrac: 0.58 });
  const goals = [], crates = [];
  let player = { c: 1, r: 1 };
  map.forEach((line, r) => [...line].forEach((ch, c) => {
    grid.set(c, r, ch === "#" ? "wall" : "floor");
    if (ch === "." || ch === "*") goals.push({ c, r });
    if (ch === "$" || ch === "*") crates.push({ c, r });
    if (ch === "@") player = { c, r };
  }));
  const px = grid.toPx(player.c, player.r);
  g.data.grid = grid;
  g.data.goals = goals;
  g.data.crates = crates.map((k) => ({ ...k, ...grid.toPx(k.c, k.r) }));
  g.data.player = { ...player, x: px.x, y: px.y, face: 1 };
  g.data.history = [];
  g.data.moves = 0;
  g.data.index = index;
  g.data.solved = false;
}

const crateAt = (g, c, r) => g.data.crates.find((k) => k.c === c && k.r === r);
const isGoal = (g, c, r) => g.data.goals.some((q) => q.c === c && q.r === r);

function step(g, dc, dr) {
  const p = g.data.player, grid = g.data.grid;
  const nc = p.c + dc, nr = p.r + dr;
  if (grid.get(nc, nr) !== "floor") { g.shake(2, 0.08); return; }
  const crate = crateAt(g, nc, nr);
  if (crate) {
    const bc = nc + dc, br = nr + dr;
    if (grid.get(bc, br) !== "floor" || crateAt(g, bc, br)) { g.shake(2, 0.08); g.sfx("hit"); return; }
    g.data.history.push({ p: { c: p.c, r: p.r }, crates: g.data.crates.map((k) => ({ c: k.c, r: k.r })) });
    crate.c = bc; crate.r = br;
    g.sfx(isGoal(g, bc, br) ? "coin" : "click");
    if (isGoal(g, bc, br)) { const q = grid.toPx(bc, br); g.burst(q.x, q.y, { color: "good", count: 10, speed: 120 }); }
  } else {
    g.data.history.push({ p: { c: p.c, r: p.r }, crates: g.data.crates.map((k) => ({ c: k.c, r: k.r })) });
  }
  p.c = nc; p.r = nr;
  if (dc) p.face = dc;
  g.data.moves += 1;
  if (g.data.crates.every((k) => isGoal(g, k.c, k.r))) {
    g.data.solved = true;
    g.addScore(Math.max(50, 300 - g.data.moves * 5), g.W / 2, g.data.grid.y - 20);
    g.after(0.8, () => {
      if (g.data.index + 1 >= LEVELS.length) g.win({ title: "ALL CLEAR!" });
      else { g.nextLevel(); loadLevel(g, g.data.index + 1); }
    });
  }
}

function undo(g) {
  const last = g.data.history.pop();
  if (!last) return;
  g.data.player.c = last.p.c; g.data.player.r = last.p.r;
  last.crates.forEach((k, i) => { g.data.crates[i].c = k.c; g.data.crates[i].r = k.r; });
  g.data.moves += 1;
  g.sfx("click");
}

g.setup((g) => loadLevel(g, 0));

g.update((g, dt) => {
  const grid = g.data.grid;
  const k = Math.min(1, dt * 16);
  const p = g.data.player, pp = grid.toPx(p.c, p.r);
  p.x = g.lerp(p.x, pp.x, k); p.y = g.lerp(p.y, pp.y, k);
  for (const c of g.data.crates) { const q = grid.toPx(c.c, c.r); c.x = g.lerp(c.x, q.x, k); c.y = g.lerp(c.y, q.y, k); }
  g.hud.set("Moves", g.data.moves);
  if (g.data.solved) return;
  if (g.input.button === "undo") return undo(g);
  if (g.input.button === "reset") { loadLevel(g, g.data.index); g.sfx("click"); return; }
  const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[g.input.swipe];
  if (d) step(g, d[0], d[1]);
});

g.draw((ctx, g) => {
  const grid = g.data.grid, s = grid.cell;
  grid.each((v, c, r) => {
    const q = grid.toPx(c, r);
    if (v === "wall") {
      // Bevelled blocks so the maze reads clearly on any palette.
      ctx.fillStyle = g.shade(g.pal.secondary, -0.5);
      ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      ctx.fillStyle = g.shade(g.pal.secondary, -0.25);
      ctx.fillRect(q.x - s / 2 + 3, q.y - s / 2 + 3, s - 6, s - 9);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(q.x - s / 2 + 3, q.y - s / 2 + 3, s - 6, 4);
      ctx.strokeStyle = "rgba(14,10,32,0.8)"; ctx.lineWidth = 2;
      ctx.strokeRect(q.x - s / 2 + 1, q.y - s / 2 + 1, s - 2, s - 2);
    } else {
      ctx.fillStyle = (c + r) % 2 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.13)";
      ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
  });
  for (const goal of g.data.goals) {
    const q = grid.toPx(goal.c, goal.r);
    ctx.strokeStyle = g.pal.good; ctx.lineWidth = 3;
    ctx.globalAlpha = 0.6 + Math.sin(g.time * 4) * 0.25;
    ctx.beginPath(); ctx.arc(q.x, q.y, s * 0.28, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const c of g.data.crates) {
    const done = isGoal(g, c.c, c.r);
    if (!g.sprite("crate", c.x, c.y, s * 0.86, s * 0.86, { alpha: done ? 1 : 0.95 })) {
      ctx.fillStyle = done ? g.pal.good : "#c98a4b";
      ctx.fillRect(c.x - s * 0.4, c.y - s * 0.4, s * 0.8, s * 0.8);
      ctx.strokeStyle = "rgba(14,10,32,0.85)"; ctx.lineWidth = 3;
      ctx.strokeRect(c.x - s * 0.4, c.y - s * 0.4, s * 0.8, s * 0.8);
      ctx.beginPath(); ctx.moveTo(c.x - s * 0.4, c.y - s * 0.4); ctx.lineTo(c.x + s * 0.4, c.y + s * 0.4); ctx.moveTo(c.x + s * 0.4, c.y - s * 0.4); ctx.lineTo(c.x - s * 0.4, c.y + s * 0.4); ctx.stroke();
    } else if (done) {
      ctx.strokeStyle = g.pal.good; ctx.lineWidth = 3; ctx.strokeRect(c.x - s * 0.45, c.y - s * 0.45, s * 0.9, s * 0.9);
    }
  }
  const p = g.data.player;
  if (!g.sprite("player", p.x, p.y, s * 0.9, s * 0.9, { flipX: p.face < 0 })) {
    ctx.fillStyle = g.pal.primary;
    ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(14,10,32,0.9)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#1b1733";
    ctx.beginPath(); ctx.arc(p.x - s * 0.1 + p.face * 4, p.y - s * 0.06, 3.5, 0, Math.PI * 2); ctx.arc(p.x + s * 0.1 + p.face * 4, p.y - s * 0.06, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  const by = g.data.grid.y + g.data.grid.h + 52;
  g.button("undo", { x: g.W / 2 - 70, y: by, w: 120, h: 46, label: "UNDO", icon: "restart", color: "secondary", size: 18, disabled: !g.data.history.length });
  g.button("reset", { x: g.W / 2 + 70, y: by, w: 120, h: 46, label: "RESET", color: "accent", size: 18 });
});
