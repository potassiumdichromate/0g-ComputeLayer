// Recipe: runner — endless side runner with jumps, double jump, coins and speed ramp.
const TUNING = { startSpeed: 230, maxSpeed: 430, rampSeconds: 90, jump: 500, gravity: 1450 };

const g = KULT.game({
  title: "Dash Runner",
  hint: "Tap to jump, tap again in the air to double jump.",
  lives: 3,
  world: { floor: (g) => floorY(g) },
  background: { deco: "hills" },
  hud: { level: false }
});

function floorY(g) { return g.H - 120; }

function spawnObstacle(g) {
  const speed = g.data.speed;
  const ttl = (g.W + 200) / speed + 1;
  if (g.time > 12 && g.chance(0.3)) {
    // Flying hazard: jump over it low, or stay under it.
    g.spawn("enemy", { x: g.W + 40, y: floorY(g) - g.pick([70, 120]), h: 34, vx: -speed * 1.15, ttl, shape: "diamond", color: "danger", face: true, tags: ["hazard"] })
      .moves("sine", { amp: 10, freq: 1.2, axis: "y" });
  } else {
    const h = g.pick([34, 44, 56]);
    g.spawn("obstacle", { x: g.W + 40, y: floorY(g) - h / 2, w: g.range(26, 38), h, vx: -speed, ttl, shape: "tri", color: "danger", sprite: g.assets.has("obstacle") ? "obstacle" : null, tags: ["hazard"], pop: false });
  }
}

function spawnCoins(g) {
  const speed = g.data.speed;
  const ttl = (g.W + 300) / speed + 1;
  const n = g.randInt(3, 5);
  const baseY = floorY(g) - g.pick([40, 110, 150]);
  for (let i = 0; i < n; i += 1) {
    const arc = Math.sin((i / (n - 1)) * Math.PI) * 30;
    g.spawn("coin", { x: g.W + 40 + i * 32, y: baseY - arc, r: 10, vx: -speed, ttl, shape: "circle", color: "primary", glow: "primary", pop: false });
  }
}

g.setup((g) => {
  g.data.speed = TUNING.startSpeed;
  g.data.dist = 0;
  g.data.player = g.spawn("player", {
    x: g.W * 0.25, y: floorY(g) - 30, h: 54, shape: "blob", color: "primary", face: true, shadow: true,
    moves: "runner", movesOpts: { jump: TUNING.jump, gravity: TUNING.gravity, doubleJump: true }
  });
  g.every(() => g.range(0.9, 1.6) * (TUNING.startSpeed / g.data.speed), () => spawnObstacle(g));
  g.every(2.3, () => spawnCoins(g));

  g.onHit("player", "hazard", (p, h) => {
    if (p.invuln > 0) return;
    h.kill({ burst: { color: "danger" } });
    p.invuln = 1.2;
    g.loseLife({ title: "WIPEOUT!" });
  });
  g.onHit("player", "coin", (p, c) => {
    c.kill({ burst: { color: "primary", count: 8 } });
    g.addScore(5, c.x, c.y - 16, { combo: true });
    g.sfx("coin");
  });
});

g.update((g, dt) => {
  g.data.speed = g.ramp(TUNING.startSpeed, TUNING.maxSpeed, TUNING.rampSeconds);
  g.bg.speedX = g.data.speed * 0.35;
  g.data.dist += g.data.speed * dt;
  while (g.data.dist >= 40) { g.data.dist -= 40; g.addScore(1); }
  const milestone = Math.floor(g.time / 20) + 1;
  if (milestone > g.level) g.nextLevel();
});

g.drawBehind((ctx, g) => {
  const y = floorY(g);
  ctx.fillStyle = g.shade(g.pal.bg2, -0.45);
  ctx.fillRect(-20, y, g.W + 40, g.H - y + 20);
  ctx.fillStyle = g.pal.secondary;
  ctx.fillRect(-20, y, g.W + 40, 6);
  const off = (g.time * g.data.speed) % 40;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let x = -off; x < g.W + 40; x += 40) ctx.fillRect(x, y + 18, 22, 5);
});

