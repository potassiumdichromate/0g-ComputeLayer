// Recipe: arena — top-down survival, auto-aim at the nearest enemy, growing waves.
const TUNING = { speed: 170, fireEvery: 0.38, bulletSpeed: 480, enemySpeed: 55, waveSeconds: 20 };

const g = KULT.game({
  title: "Arena Survivor",
  hint: "Drag anywhere (or WASD) to move. You shoot the nearest enemy automatically.",
  lives: 3,
  background: { deco: "dots" },
  hud: { level: true }
});

function nearestEnemy(g, from) {
  let best = null, bestD = Infinity;
  for (const e of g.all("enemy")) {
    const d = g.dist(e, from);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

function spawnEnemy(g) {
  const side = g.randInt(0, 3);
  const x = side === 0 ? -20 : side === 1 ? g.W + 20 : g.range(0, g.W);
  const y = side === 2 ? -20 : side === 3 ? g.H + 20 : g.range(0, g.H);
  const brute = g.level >= 3 && g.chance(0.2);
  g.spawn("enemy", {
    x, y, h: brute ? 48 : 32, hp: brute ? 4 : 1 + Math.floor(g.level / 4), shape: "blob", face: true,
    color: brute ? "danger" : "accent", keep: true,
    moves: "chase", movesOpts: { target: "player", speed: TUNING.enemySpeed + g.level * 6 + (brute ? -15 : 0) }
  });
}

g.setup((g) => {
  const player = g.spawn("player", { x: g.W / 2, y: g.H / 2, h: 44, shape: "blob", color: "primary", face: true, shadow: true, moves: "topdown", movesOpts: { speed: TUNING.speed }, keep: true });
  g.data.player = player;
  g.every(TUNING.fireEvery, () => {
    const target = nearestEnemy(g, player);
    if (!target || g.dist(target, player) > 320) return;
    const a = player.angleTo(target);
    g.spawn("bullet", { x: player.x, y: player.y, w: 8, h: 8, shape: "circle", color: "primary", glow: "primary", vx: Math.cos(a) * TUNING.bulletSpeed, vy: Math.sin(a) * TUNING.bulletSpeed, ttl: 1.2, bounds: "kill", pop: false });
    g.sfx("shoot");
  });
  g.every(() => Math.max(0.3, 1.4 - g.level * 0.15), () => spawnEnemy(g));
  g.every(TUNING.waveSeconds, () => g.nextLevel());

  g.onHit("bullet", "enemy", (b, e) => {
    b.kill();
    if (e.hit(1)) {
      g.addScore(e.maxHp > 1 ? 25 : 10, e.x, e.y, { combo: true });
      g.sfx("explode");
      if (g.chance(0.3)) g.spawn("gem", { x: e.x, y: e.y, size: 14, shape: "diamond", color: "good", glow: "good", ttl: 8 });
    } else {
      g.sfx("hit");
    }
  });
  g.onHit("player", "enemy", (p, e) => {
    if (p.invuln > 0) return;
    e.kill({ burst: { color: "danger" } });
    p.invuln = 1.4;
    g.loseLife({ title: "OVERRUN!" });
  });
  g.onHit("player", "gem", (p, gem) => {
    gem.kill({ burst: { color: "good", count: 8 } });
    g.addScore(15, gem.x, gem.y - 12);
    g.sfx("coin");
  });
});
