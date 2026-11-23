// Recipe: snake — classic grid snake. Swipe, arrows/WASD, or tap beside the
// head to turn. Eat food to grow and score; a golden bonus appears now and then
// for a few seconds; every 5 foods is a level and the snake speeds up. Hitting a
// wall or your own tail ends the run.
const TUNING = { cols: 15, rows: 21, startLen: 4, startStep: 0.16, minStep: 0.065, speedUp: 0.012, perLevel: 5, food: 10, bonus: 50, bonusEvery: 7, bonusLife: 5 };

const g = KULT.game({
  title: "Neon Snake",
  hint: "Swipe (or tap beside the head) to turn. Eat, grow, don't bite yourself!",
  lives: 0,
  background: { deco: "grid" },
  hud: { level: true }
});

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function freeCell(g) {
  const taken = new Set(g.data.body.map((p) => p.c + "," + p.r));
  if (g.data.food) taken.add(g.data.food.c + "," + g.data.food.r);
  if (g.data.bonus) taken.add(g.data.bonus.c + "," + g.data.bonus.r);
  const free = [];
  for (let r = 0; r < TUNING.rows; r += 1) for (let c = 0; c < TUNING.cols; c += 1) if (!taken.has(c + "," + r)) free.push({ c, r });
  return free.length ? g.pick(free) : null;
}

function turn(g, name) {
  const d = DIRS[name];
  if (!d) return;
  const last = g.data.queue.length ? g.data.queue[g.data.queue.length - 1] : g.data.dir;
  if (d[0] === -last[0] && d[1] === -last[1]) return;
  if (d[0] === last[0] && d[1] === last[1]) return;
  if (g.data.queue.length < 3) g.data.queue.push(d);
}

g.setup((g) => {
  g.data.grid = g.grid({ cols: TUNING.cols, rows: TUNING.rows, gap: 0, offsetY: 6, heightFrac: 0.74 });
  const mid = Math.floor(TUNING.rows / 2);
  g.data.body = [];
  for (let i = 0; i < TUNING.startLen; i += 1) g.data.body.push({ c: 4 - i, r: mid });
  g.data.prev = g.data.body.map((p) => ({ ...p }));
  g.data.dir = [1, 0];
  g.data.queue = [];
  g.data.step = TUNING.startStep;
  g.data.clock = 0;
  g.data.eaten = 0;
  g.data.food = null; g.data.bonus = null;
  g.data.food = freeCell(g);
  g.data.dead = false;
});

function advance(g) {
  if (g.data.queue.length) g.data.dir = g.data.queue.shift();
  const head = g.data.body[0];
  const next = { c: head.c + g.data.dir[0], r: head.r + g.data.dir[1] };
  const grid = g.data.grid;
  const grows = g.data.food && next.c === g.data.food.c && next.r === g.data.food.r;
  const bonus = g.data.bonus && next.c === g.data.bonus.c && next.r === g.data.bonus.r;
  const bodyToCheck = grows ? g.data.body : g.data.body.slice(0, -1);
  if (!grid.inside(next.c, next.r) || bodyToCheck.some((p) => p.c === next.c && p.r === next.r)) {
    g.data.dead = true;
    const q = grid.toPx(head.c, head.r);
    g.burst(q.x, q.y, { color: "danger", count: 26, speed: 220 });
    g.shake(8, 0.35); g.sfx("explode");
    g.after(0.7, () => g.over({ title: grid.inside(next.c, next.r) ? "TAIL BITTEN!" : "HIT THE WALL!" }));
    return;
  }
  g.data.prev = g.data.body.map((p) => ({ ...p }));
  g.data.body.unshift(next);
  if (!grows && !bonus) g.data.body.pop();
  else g.data.prev.push({ ...g.data.prev[g.data.prev.length - 1] });
  const q = grid.toPx(next.c, next.r);
  if (grows) {
    g.data.eaten += 1;
    g.addScore(TUNING.food * g.level, q.x, q.y, { combo: true });
    g.burst(q.x, q.y, { color: "good", count: 10, speed: 120 });
    g.sfx("coin");
    g.data.food = freeCell(g);
    g.data.step = Math.max(TUNING.minStep, g.data.step - TUNING.speedUp * 0.3);
    if (g.data.eaten % TUNING.perLevel === 0) { g.nextLevel(); g.data.step = Math.max(TUNING.minStep, g.data.step - TUNING.speedUp); }
    if (g.data.eaten % TUNING.bonusEvery === 0 && !g.data.bonus) { const b = freeCell(g); if (b) g.data.bonus = { ...b, t: TUNING.bonusLife }; }
  }
  if (bonus) {
    g.addScore(TUNING.bonus * g.level, q.x, q.y);
    g.floatText(q.x, q.y - 22, "BONUS!", "accent", 20);
    g.burst(q.x, q.y, { color: "accent", count: 18, speed: 180 });
    g.sfx("power"); g.flash("accent", 0.15);
    g.data.bonus = null;
  }
}

g.update((g, dt) => {
  if (g.data.dead) return;
  if (g.input.swipe) turn(g, g.input.swipe);
  // Tap beside the head: turn toward the tap (across the current direction).
  const grid = g.data.grid;
  for (const tap of g.input.taps) {
    const h = grid.toPx(g.data.body[0].c, g.data.body[0].r);
    const dx = tap.x - h.x, dy = tap.y - h.y;
    if (g.data.dir[0] !== 0) turn(g, dy < 0 ? "up" : "down");
    else turn(g, dx < 0 ? "left" : "right");
  }
  if (g.data.bonus) { g.data.bonus.t -= dt; if (g.data.bonus.t <= 0) g.data.bonus = null; }
  g.data.clock += dt;
  while (g.data.clock >= g.data.step && !g.data.dead) { g.data.clock -= g.data.step; advance(g); }
  g.hud.set("Length", g.data.body.length);
});

g.draw((ctx, g) => {
  const grid = g.data.grid, s = grid.cell;
  g.panel(grid.x - 6, grid.y - 6, grid.w + 12, grid.h + 12, { r: 12 });
  grid.each((v, c, r) => { if ((c + r) % 2) { ctx.fillStyle = "rgba(255,255,255,0.045)"; ctx.fillRect(grid.x + c * s, grid.y + r * s, s, s); } });
  const k = g.data.dead ? 1 : Math.min(1, g.data.clock / g.data.step);
  const pos = (i) => {
    const a = g.data.prev[i] || g.data.body[i], b = g.data.body[i];
    const pa = grid.toPx(a.c, a.r), pb = grid.toPx(b.c, b.r);
    return { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k };
  };
  const f = g.data.food;
  if (f) {
    const q = grid.toPx(f.c, f.r), pulse = 1 + Math.sin(g.time * 6) * 0.08;
    if (!g.sprite("food", q.x, q.y, s * 1.1 * pulse, s * 1.1 * pulse)) {
      ctx.fillStyle = g.color("danger"); ctx.shadowColor = g.color("danger"); ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(q.x, q.y, s * 0.36 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = g.color("good"); ctx.fillRect(q.x - 1.5, q.y - s * 0.5, 3, s * 0.22);
    }
  }
  const b = g.data.bonus;
  if (b) {
    const q = grid.toPx(b.c, b.r), blink = b.t < 1.5 && Math.sin(g.time * 20) > 0;
    if (!blink && !g.sprite("bonus", q.x, q.y, s * 1.2, s * 1.2)) {
      ctx.fillStyle = "#ffd34d"; ctx.shadowColor = "#ffd34d"; ctx.shadowBlur = 16;
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? s * 0.22 : s * 0.5; ctx.lineTo(q.x + Math.cos(a) * d, q.y + Math.sin(a) * d); }
      ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    }
  }
  // Body: a thick rounded line from tail to head, then the head on top.
  const n = g.data.body.length;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (let i = n - 1; i > 0; i -= 1) {
    const a = pos(i), z = pos(i - 1);
    ctx.strokeStyle = g.shade(g.color("good"), -0.25 + (1 - i / n) * 0.35);
    ctx.lineWidth = s * (0.62 + 0.18 * (1 - i / n));
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(z.x, z.y); ctx.stroke();
  }
  const h = pos(0), d = g.data.dir;
  if (!g.sprite("player", h.x, h.y, s * 1.25, s * 1.25, { rot: Math.atan2(d[1], d[0]) })) {
    ctx.fillStyle = g.color("good");
    ctx.beginPath(); ctx.arc(h.x, h.y, s * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(10,8,30,0.6)"; ctx.lineWidth = 2; ctx.stroke();
    for (const side of [-1, 1]) {
      const ex = h.x + d[0] * s * 0.18 - d[1] * side * s * 0.22, ey = h.y + d[1] * s * 0.18 + d[0] * side * s * 0.22;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, ey, s * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#14102a"; ctx.beginPath(); ctx.arc(ex + d[0] * 2, ey + d[1] * 2, s * 0.07, 0, Math.PI * 2); ctx.fill();
    }
  }
});
