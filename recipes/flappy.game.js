// Recipe: flappy — tap to flap through scrolling gaps.
const TUNING = { flap: 300, gravity: 950, speed: 150, gap: 170, minGap: 125, spawnEvery: 1.6 };

const g = KULT.game({
  title: "Sky Hopper",
  hint: "Tap or press Space to flap. Fly through the gaps!",
  lives: 0,
  background: { deco: "clouds", speedX: 30 },
  hud: { level: true }
});

function spawnGate(g) {
  const gap = Math.max(TUNING.minGap, TUNING.gap - g.time * 0.8);
  const center = g.range(110 + gap / 2, g.H - 130 - gap / 2);
  const speed = g.data.speed;
  const w = 62;
  const x = g.W + w;
  const ttl = (g.W + 3 * w) / speed + 1;
  const topH = center - gap / 2;
  const bottomY = center + gap / 2;
  const bottomH = g.H - 60 - bottomY;
  g.spawn("obstacle", { x, y: topH / 2, w, h: topH, vx: -speed, ttl, color: "good", sprite: null, pop: false });
  g.spawn("obstacle", { x, y: bottomY + bottomH / 2, w, h: bottomH, vx: -speed, ttl, color: "good", sprite: null, pop: false });
  g.spawn("gate", { x: x + w / 2, y: center, w: 8, h: gap, vx: -speed, ttl, alpha: 0, sprite: null, pop: false });
  if (g.chance(0.45)) {
    g.spawn("coin", { x, y: center + g.range(-gap / 4, gap / 4), r: 11, vx: -speed, ttl, shape: "circle", color: "primary", glow: "primary" });
  }
}

function crash(g, player) {
  if (g.data.crashed) return;
  g.data.crashed = true;
  player.kill({ burst: { color: "primary", count: 26, speed: 220 } });
  g.shake(12, 0.35);
  g.sfx("hit");
  g.after(0.7, () => g.over({ title: "OUCH!" }));
}

g.setup((g) => {
  g.data.speed = TUNING.speed;
  g.data.crashed = false;
  g.data.player = g.spawn("player", {
    x: g.W * 0.3, y: g.H * 0.42, h: 44, shape: "blob", color: "primary", face: true,
    moves: "flap", movesOpts: { flap: TUNING.flap, gravity: TUNING.gravity }
  });
  g.after(0.5, () => spawnGate(g));
  g.every(() => Math.max(1.05, TUNING.spawnEvery - g.time * 0.012), () => spawnGate(g));

  g.onHit("player", "obstacle", (p) => crash(g, p));
  g.onHit("player", "gate", (p, gate) => {
    gate.kill({ burst: false });
    g.addScore(1, p.x, p.y - 36);
    g.sfx("pop");
    if (g.score > 0 && g.score % 10 === 0) g.nextLevel();
  });
  g.onHit("player", "coin", (p, c) => {
    c.kill({ burst: { color: "primary", count: 10 } });
    g.addScore(3, c.x, c.y - 20, { combo: true });
    g.sfx("coin");
  });
});

g.onLevel((g) => { g.data.speed += 18; });

g.update((g) => {
  const p = g.data.player;
  if (!p || p.dead) return;
  if (p.y > g.H - 60 - p.h / 2) crash(g, p);
  if (p.y < p.h / 2) { p.y = p.h / 2; p.vy = Math.max(0, p.vy); }
});

g.drawBehind((ctx, g) => {
  const groundY = g.H - 60;
  ctx.fillStyle = g.shade(g.pal.bg2, -0.35);
  ctx.fillRect(-20, groundY, g.W + 40, 80);
  ctx.fillStyle = g.pal.good;
  ctx.fillRect(-20, groundY, g.W + 40, 8);
  const off = (g.time * g.data.speed) % 24;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  for (let x = -off; x < g.W + 24; x += 24) ctx.fillRect(x, groundY + 14, 12, 6);
});
