// Recipe: bullethell — a boss at the top fires dense bullet patterns (rings,
// spirals, aimed fans); you have a tiny hitbox, auto-fire upward, and earn
// graze points for near misses. Each boss is stronger.
const TUNING = { bossHp: 140, hpPerLevel: 60, bulletSpeed: 150, playerFire: 0.09, grazeRadius: 22 };

const g = KULT.game({
  title: "Danmaku Storm",
  hint: "Drag to dodge — only the glowing core is your hitbox. You fire automatically.",
  lives: 3,
  background: { deco: "stars", speedY: -40 },
  hud: { level: true }
});

function enemyShot(g, x, y, ang, speed, color) {
  g.spawn("orb", { x, y, r: 6, shape: "circle", color: color || "danger", glow: color || "danger", vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, bounds: "kill", tags: ["hazard"], hitbox: 0.8, pop: false, ttl: 8, data: { grazed: false } });
}

const PATTERNS = {
  ring(g, b) { const n = 14 + g.level * 2; const off = g.rand() * 6.28; for (let i = 0; i < n; i += 1) enemyShot(g, b.x, b.y, off + (i * Math.PI * 2) / n, TUNING.bulletSpeed, "accent"); },
  spiral(g, b) { for (let k = 0; k < 2; k += 1) enemyShot(g, b.x, b.y, b.data.spin + k * Math.PI, TUNING.bulletSpeed * 1.1, "secondary"); b.data.spin += 0.32; },
  fan(g, b) { const p = g.data.player; const base = Math.atan2(p.y - b.y, p.x - b.x); for (let i = -3; i <= 3; i += 1) enemyShot(g, b.x, b.y, base + i * 0.14, TUNING.bulletSpeed * 1.35, "danger"); }
};

function spawnBoss(g) {
  const hp = TUNING.bossHp + (g.level - 1) * TUNING.hpPerLevel;
  g.data.boss = g.spawn("boss", { x: g.W / 2, y: 120, h: 96, shape: "diamond", color: "danger", face: true, hp, keep: true, glow: "accent", data: { spin: 0, pattern: "ring", cd: 1, phaseT: 0, maxHp: hp } });
  g.data.boss.moves("sine", { amp: g.W * 0.28, freq: 0.18, axis: "x" });
}

g.setup((g) => {
  const p = g.spawn("player", { x: g.W / 2, y: g.H - 110, h: 42, shape: "tri", color: "secondary", hitbox: 0.22, keep: true, moves: "drag", movesOpts: { axis: "xy", offsetY: -60 } });
  p.shoots({ every: TUNING.playerFire, dir: "up", speed: 700, type: "shot", color: "primary", w: 5, h: 18, sfx: false });
  g.data.player = p;
  spawnBoss(g);

  g.onHit("shot", "boss", (s, b) => {
    s.kill();
    b.flash(0.05);
    if (b.hit(1)) {
      g.addScore(1000 * g.level, b.x, b.y);
      g.burst(b.x, b.y, { color: ["danger", "primary", "accent"], count: 60, speed: 340, life: 1.2 });
      g.shake(14, 0.6); g.sfx("explode"); g.flash("#ffffff", 0.5);
      g.clear("hazard");
      g.after(1.6, () => { g.nextLevel(); spawnBoss(g); });
    }
  });
  g.onHit("player", "hazard", (p, o) => {
    if (p.invuln > 0) return;
    o.kill();
    p.invuln = 2;
    g.clear("hazard");
    g.loseLife({ title: "SHOT DOWN" });
  });
});

g.update((g, dt) => {
  const b = g.data.boss, p = g.data.player;
  if (b && !b.dead) {
    const d = b.data;
    d.phaseT += dt;
    if (d.phaseT > 5) { d.phaseT = 0; d.pattern = g.pick(Object.keys(PATTERNS)); }
    d.cd -= dt;
    const rate = { ring: 1.1, spiral: 0.08, fan: 0.7 }[d.pattern] * Math.max(0.55, 1 - g.level * 0.08) * (b.hp < d.maxHp / 3 ? 0.75 : 1);
    if (d.cd <= 0) { d.cd = rate; PATTERNS[d.pattern](g, b); }
    g.hud.set("Boss", `${Math.max(0, Math.round((b.hp / d.maxHp) * 100))}%`);
  }
  // Graze: points for bullets that pass close without hitting.
  for (const o of g.all("orb")) {
    if (o.data.grazed) continue;
    if (Math.hypot(o.x - p.x, o.y - p.y) < TUNING.grazeRadius + 10) { o.data.grazed = true; g.addScore(5); g.burst(p.x, p.y, { color: "#ffffff", count: 2, speed: 80, gravity: 0, life: 0.3 }); }
  }
});

g.draw((ctx, g) => {
  const p = g.data.player, b = g.data.boss;
  ctx.fillStyle = "#ffffff"; ctx.shadowColor = g.pal.secondary; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  if (b && !b.dead) {
    const w = g.W - 60, frac = b.hp / b.data.maxHp;
    g.panel(30, 92, w, 12, { r: 6 });
    ctx.fillStyle = frac > 0.33 ? g.pal.danger : g.pal.primary; ctx.fillRect(32, 94, (w - 4) * frac, 8);
  }
});
