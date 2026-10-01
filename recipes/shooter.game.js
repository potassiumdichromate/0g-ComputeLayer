// Recipe: shooter — drag the ship, auto-fire, descending enemy waves that shoot back.
const TUNING = { fireEvery: 0.22, enemySpeed: 70, spawnEvery: 1.1, enemyFireChance: 0.35 };

const g = KULT.game({
  title: "Star Blaster",
  hint: "Drag to move your ship. It fires automatically. Grab stars for power!",
  lives: 3,
  background: { deco: "stars", speedY: -60 },
  hud: { level: true }
});

function spawnEnemy(g) {
  const tough = g.level >= 2 && g.chance(0.25);
  const e = g.spawn("enemy", {
    x: g.range(30, g.W - 30), y: -30, h: tough ? 46 : 36,
    vy: TUNING.enemySpeed + g.level * 12, hp: tough ? 3 : 1, shape: tough ? "diamond" : "blob",
    color: tough ? "danger" : "accent", face: true, bounds: "none", ttl: 20, facing: "down"
  });
  e.moves("sine", { amp: g.range(20, 60), freq: g.range(0.3, 0.8), axis: "x" });
  if (g.chance(TUNING.enemyFireChance + g.level * 0.05)) {
    e.shoots({ every: g.range(1.4, 2.4), delay: g.range(0.6, 1.4), dir: g.data.player, speed: 190, type: "enemy_bullet", tags: ["hazard"], color: "danger", w: 8, h: 8, shape: "circle", sfx: false });
  }
}

g.setup((g) => {
  g.data.kills = 0;
  g.data.power = 0;
  const player = g.spawn("player", { x: g.W / 2, y: g.H - 90, h: 52, shape: "tri", color: "secondary", moves: "drag", movesOpts: { axis: "xy", offsetY: -50 }, bounds: "clamp" });
  player.shoots({ every: TUNING.fireEvery, dir: "up", type: "bullet", tags: ["shot"], color: "primary", speed: 560 });
  g.data.player = player;

  g.every(() => Math.max(0.35, TUNING.spawnEvery - g.level * 0.12), () => spawnEnemy(g));
  g.every(9, () => g.spawn("powerup", { x: g.range(40, g.W - 40), y: -20, r: 14, shape: "star", color: "primary", glow: "primary", vy: 90, spin: 2, bounds: "none", ttl: 12 }));

  g.onHit("shot", "enemy", (shot, enemy) => {
    shot.kill();
    if (enemy.hit(1)) {
      g.addScore(enemy.maxHp > 1 ? 30 : 10, enemy.x, enemy.y, { combo: true });
      g.sfx("explode");
      g.shake(3, 0.12);
      g.data.kills += 1;
      if (g.data.kills % 15 === 0) g.nextLevel();
    } else {
      g.sfx("hit");
    }
  });
  g.onHit("player", "enemy", (p, e) => {
    if (p.invuln > 0) return;
    e.kill({ burst: { color: "danger", count: 18 } });
    p.invuln = 1.5;
    g.loseLife({ title: "SHOT DOWN" });
  });
  g.onHit("player", "hazard", (p, b) => {
    if (p.invuln > 0) return;
    b.kill();
    p.invuln = 1.5;
    g.loseLife({ title: "SHOT DOWN" });
  });
  g.onHit("player", "powerup", (p, s) => {
    s.kill({ burst: { color: "primary", count: 20 } });
    g.sfx("power");
    g.flash("primary", 0.25);
    for (const e of g.all("enemy")) { g.addScore(5, e.x, e.y); e.kill({ burst: true }); }
    g.shake(8, 0.3);
  });
});

g.update((g) => {
  for (const e of g.all("enemy")) {
    if (e.y > g.H + 40) {
      e.kill();
      g.addScore(-2);
      if (g.score < 0) g.score = 0;
    }
  }
});
