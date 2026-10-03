// Recipe: mergedrop — drop round items into a jar; two of the same size merge
// into the next size; don't let the pile pass the line (Suika-style).
const TUNING = { gravity: 1100, restitution: 0.15, friction: 0.995, substeps: 4, dropCooldown: 0.55, overTime: 2.2 };
const SIZES = [14, 19, 25, 32, 40, 49, 59, 70];
const NAMES = ["fruit_1", "fruit_2", "fruit_3", "fruit_4", "fruit_5", "fruit_6", "fruit_7", "fruit_8"];
const COLORS = ["danger", "accent", "primary", "#ff9b3d", "good", "secondary", "#b48cff", "#ffffff"];

const g = KULT.game({
  title: "Fruit Merge",
  hint: "Drag to aim, release to drop. Two of the same fruit merge into a bigger one!",
  lives: 0,
  background: { deco: "bubbles" },
  hud: { level: false }
});

function jar(g) {
  const w = g.W - 30, top = g.H * 0.24, bottom = g.H - 30;
  return { left: (g.W - w) / 2, right: (g.W + w) / 2, top, bottom, line: top + 12 };
}

function drawFruit(ctx, g, level, x, y, rot) {
  const r = SIZES[level];
  if (g.sprite(NAMES[level], x, y, r * 2.1, r * 2.1, { rot })) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.fillStyle = g.color(COLORS[level]);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(14,10,32,0.85)"; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.35, r * 0.28, r * 0.17, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1b1733";
  ctx.beginPath(); ctx.arc(-r * 0.25, 0, Math.max(2, r * 0.09), 0, Math.PI * 2); ctx.arc(r * 0.25, 0, Math.max(2, r * 0.09), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function physics(g, dt) {
  const J = jar(g);
  const balls = g.data.balls;
  for (const b of balls) {
    b.vy += TUNING.gravity * dt;
    b.vx *= TUNING.friction;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.rot += (b.vx / Math.max(8, b.r)) * dt;
    if (b.x - b.r < J.left) { b.x = J.left + b.r; b.vx = Math.abs(b.vx) * TUNING.restitution; }
    if (b.x + b.r > J.right) { b.x = J.right - b.r; b.vx = -Math.abs(b.vx) * TUNING.restitution; }
    if (b.y + b.r > J.bottom) { b.y = J.bottom - b.r; b.vy = -Math.abs(b.vy) * TUNING.restitution; b.vx *= 0.92; }
  }
  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i], b = balls[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001, min = a.r + b.r;
      if (d >= min) continue;
      if (a.level === b.level && a.level < SIZES.length - 1) { merge(g, a, b); continue; }
      const nx = dx / d, ny = dy / d, push = (min - d) / 2;
      const wa = b.r * b.r / (a.r * a.r + b.r * b.r), wb = 1 - wa;
      a.x -= nx * push * 2 * wa; a.y -= ny * push * 2 * wa;
      b.x += nx * push * 2 * wb; b.y += ny * push * 2 * wb;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const imp = -(1 + TUNING.restitution) * rel / 2;
        a.vx -= imp * nx * wa * 2; a.vy -= imp * ny * wa * 2;
        b.vx += imp * nx * wb * 2; b.vy += imp * ny * wb * 2;
      }
    }
  }
  g.data.balls = balls.filter((b) => !b.dead);
}

function merge(g, a, b) {
  a.dead = true; b.dead = true;
  const level = a.level + 1;
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
  g.data.balls.push({ x, y, vx: 0, vy: -60, r: SIZES[level], level, rot: 0, age: 0, pop: 0.2 });
  g.addScore((level + 1) * (level + 1) * 2, x, y - SIZES[level], { combo: true });
  g.burst(x, y, { color: COLORS[level], count: 10 + level * 3, speed: 160 + level * 20 });
  g.sfx(level >= 5 ? "power" : "pop");
  if (level >= 5) g.shake(4 + level, 0.2);
  g.data.best = Math.max(g.data.best, level);
}

g.setup((g) => {
  g.data.balls = [];
  g.data.next = g.randInt(0, 2);
  g.data.after = g.randInt(0, 2);
  g.data.aimX = g.W / 2;
  g.data.cd = 0;
  g.data.danger = 0;
  g.data.best = 0;
});

g.update((g, dt) => {
  const J = jar(g);
  const r = SIZES[g.data.next];
  if (g.input.down) g.data.aimX = g.clamp(g.input.x, J.left + r, J.right - r);
  const ax = g.input.axis().x;
  if (ax) g.data.aimX = g.clamp(g.data.aimX + ax * 260 * dt, J.left + r, J.right - r);
  g.data.cd -= dt;
  if ((g.input.released || g.input.action) && g.data.cd <= 0) {
    g.data.balls.push({ x: g.data.aimX, y: J.top - r - 6, vx: 0, vy: 0, r, level: g.data.next, rot: 0, age: 0, pop: 0 });
    g.data.next = g.data.after;
    g.data.after = g.randInt(0, Math.min(4, 2 + Math.floor(g.data.best / 2)));
    g.data.cd = TUNING.dropCooldown;
    g.sfx("click");
  }
  const step = dt / TUNING.substeps;
  for (let i = 0; i < TUNING.substeps; i += 1) physics(g, step);
  for (const b of g.data.balls) { b.age += dt; if (b.pop > 0) b.pop -= dt; }
  // Lose: a settled piece stays above the line too long.
  const over = g.data.balls.some((b) => b.age > 1 && b.y - b.r < J.line && Math.abs(b.vy) < 40);
  g.data.danger = over ? g.data.danger + dt : Math.max(0, g.data.danger - dt * 2);
  if (g.data.danger > TUNING.overTime) g.over({ title: "JAR OVERFLOW" });
});

g.draw((ctx, g) => {
  const J = jar(g);
  g.panel(J.left - 6, J.top - 6, J.right - J.left + 12, J.bottom - J.top + 12, { fill: "rgba(255,255,255,0.08)" });
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = g.data.danger > 0 ? g.pal.danger : "rgba(255,255,255,0.4)";
  ctx.globalAlpha = g.data.danger > 0 ? 0.6 + Math.sin(g.time * 18) * 0.4 : 1;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(J.left, J.line); ctx.lineTo(J.right, J.line); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  for (const b of g.data.balls) {
    const s = b.pop > 0 ? 1 + Math.sin((b.pop / 0.2) * Math.PI) * 0.2 : 1;
    ctx.save(); ctx.translate(b.x, b.y); ctx.scale(s, s); drawFruit(ctx, g, b.level, 0, 0, b.rot); ctx.restore();
  }
  // Aim guide + the next piece waiting above the jar.
  const r = SIZES[g.data.next];
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(g.data.aimX, J.top - r); ctx.lineTo(g.data.aimX, J.bottom); ctx.stroke();
  ctx.globalAlpha = g.data.cd > 0 ? 0.4 : 1;
  drawFruit(ctx, g, g.data.next, g.data.aimX, J.top - r - 8, 0);
  ctx.globalAlpha = 1;
  g.text("NEXT", g.W - 52, J.top - 70, { size: 11, align: "center", stroke: false, color: "rgba(255,255,255,0.7)" });
  ctx.save(); ctx.translate(g.W - 52, J.top - 42); ctx.scale(0.7, 0.7); drawFruit(ctx, g, g.data.after, 0, 0, 0); ctx.restore();
});
