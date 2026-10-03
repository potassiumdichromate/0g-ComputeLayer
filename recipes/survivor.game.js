// Recipe: survivor — roguelite: move with a joystick, weapons fire on their
// own, enemies swarm from every side. Kills drop XP gems; each level-up pauses
// the action and offers 3 upgrade cards.
const TUNING = { speed: 165, fireEvery: 0.55, bulletSpeed: 460, enemySpeed: 48, xpBase: 5, xpGrowth: 1.45, magnet: 70 };
const UPGRADES = [
  { id: "damage", label: "POWER +1", apply: (d) => { d.damage += 1; } },
  { id: "rate", label: "FIRE RATE +25%", apply: (d) => { d.fireEvery *= 0.75; } },
  { id: "multi", label: "EXTRA SHOT", apply: (d) => { d.shots += 1; } },
  { id: "speed", label: "MOVE SPEED +15%", apply: (d) => { d.speed *= 1.15; } },
  { id: "magnet", label: "GEM MAGNET +50%", apply: (d) => { d.magnet *= 1.5; } },
  { id: "orbit", label: "ORBITING BLADE", apply: (d) => { d.blades += 1; } },
  { id: "heal", label: "HEAL 1 HEART", apply: (d, g) => { g.gainLife(); } }
];

const g = KULT.game({
  title: "Night Survivors",
  hint: "Drag anywhere to move. You attack automatically. Level up and pick upgrades!",
  lives: 4,
  background: { deco: "dots" },
  hud: { level: true }
});

function spawnEnemy(g) {
  const p = g.data.player, a = g.rand() * Math.PI * 2, d = Math.max(g.W, g.H) * 0.62;
  const elite = g.time > 40 && g.chance(0.12);
  g.spawn(elite ? "elite" : "enemy", {
    x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, h: elite ? 46 : 30, shape: "blob", face: true,
    color: elite ? "danger" : "accent", hp: (elite ? 6 : 1) + Math.floor(g.time / 30), tags: ["enemy"], keep: true,
    data: { speed: TUNING.enemySpeed * (elite ? 0.8 : 1) * (1 + g.time / 180) }
  });
}

function offerUpgrades(g) {
  const pool = UPGRADES.filter((u) => u.id !== "heal" || g.lives < g.maxLives);
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(g.randInt(0, pool.length - 1), 1)[0]);
  g.data.choices = picks;
  g.sfx("level");
}

g.setup((g) => {
  g.data.stats = { damage: 1, fireEvery: TUNING.fireEvery, shots: 1, speed: TUNING.speed, magnet: TUNING.magnet, blades: 0 };
  g.data.xp = 0; g.data.xpNeed = TUNING.xpBase; g.data.lvl = 1;
  g.data.choices = null; g.data.fireCd = 0;
  g.data.player = g.spawn("player", { x: g.W / 2, y: g.H / 2, h: 44, shape: "blob", color: "primary", face: true, keep: true, shadow: true, z: 3 });
  g.every(() => Math.max(0.18, 0.9 - g.time * 0.008), () => { if (!g.data.choices) spawnEnemy(g); });

  g.onHit("bullet", "enemy", (b, e) => {
    b.kill();
    if (e.hit(g.data.stats.damage)) {
      g.addScore(e.is("elite") ? 30 : 5);
      g.spawn("gem", { x: e.x, y: e.y, size: e.is("elite") ? 18 : 12, shape: "diamond", color: "good", glow: "good", keep: true, data: { xp: e.is("elite") ? 5 : 1 } });
      g.sfx("explode");
    } else g.sfx("hit");
  });
  g.onHit("player", "enemy", (p, e) => {
    if (p.invuln > 0 || g.data.choices) return;
    e.kill({ burst: { color: "danger" } });
    p.invuln = 1.2;
    g.loseLife({ title: "OVERWHELMED" });
  });
  g.onHit("player", "gem", (p, gem) => {
    gem.kill({ burst: false });
    g.data.xp += gem.data.xp;
    g.sfx("coin");
    if (g.data.xp >= g.data.xpNeed) {
      g.data.xp -= g.data.xpNeed;
      g.data.xpNeed = Math.round(g.data.xpNeed * TUNING.xpGrowth);
      g.data.lvl += 1;
      g.nextLevel();
      offerUpgrades(g);
    }
  });
});

g.update((g, dt) => {
  const p = g.data.player, st = g.data.stats;
  if (g.data.choices) {
    // Paused for the upgrade pick: freeze the swarm.
    for (const e of g.all("enemy")) { e.vx = 0; e.vy = 0; }
    p.vx = 0; p.vy = 0;
    const pick = g.data.choices.find((u) => g.input.button === u.id);
    if (pick) { pick.apply(st, g); g.data.choices = null; g.flash("primary", 0.2); g.sfx("power"); }
    return;
  }
  const a = g.input.axis();
  p.vx = g.lerp(p.vx, a.x * st.speed, Math.min(1, dt * 12));
  p.vy = g.lerp(p.vy, a.y * st.speed, Math.min(1, dt * 12));
  if (Math.abs(p.vx) > 5) p.flipX = p.vx < 0;
  // Camera keeps the player centred; the world is endless.
  g.camera.x = p.x - g.W / 2; g.camera.y = p.y - g.H / 2;

  for (const e of g.all("enemy")) {
    const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
    e.vx = ((p.x - e.x) / d) * e.data.speed; e.vy = ((p.y - e.y) / d) * e.data.speed;
    e.flipX = e.vx < 0;
  }
  for (const gem of g.all("gem")) {
    const d = Math.hypot(p.x - gem.x, p.y - gem.y);
    if (d < st.magnet) { gem.x = g.lerp(gem.x, p.x, Math.min(1, dt * 8)); gem.y = g.lerp(gem.y, p.y, Math.min(1, dt * 8)); }
  }
  g.data.fireCd -= dt;
  if (g.data.fireCd <= 0) {
    let target = null, best = Infinity;
    for (const e of g.all("enemy")) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < best) { best = d; target = e; } }
    if (target && best < 330) {
      g.data.fireCd = st.fireEvery;
      const base = Math.atan2(target.y - p.y, target.x - p.x);
      for (let i = 0; i < st.shots; i += 1) {
        const ang = base + (i - (st.shots - 1) / 2) * 0.18;
        g.spawn("bullet", { x: p.x, y: p.y, r: 5, shape: "circle", color: "primary", glow: "primary", vx: Math.cos(ang) * TUNING.bulletSpeed, vy: Math.sin(ang) * TUNING.bulletSpeed, ttl: 0.9, pop: false, keep: true });
      }
      g.sfx("shoot");
    }
  }
  // Orbiting blades damage what they touch.
  for (let i = 0; i < st.blades; i += 1) {
    const ang = g.time * 3 + (i * Math.PI * 2) / st.blades;
    const bx = p.x + Math.cos(ang) * 60, by = p.y + Math.sin(ang) * 60;
    for (const e of g.all("enemy")) if (Math.hypot(e.x - bx, e.y - by) < e.w / 2 + 10 && e.invuln <= 0) { e.invuln = 0.4; if (e.hit(1)) { g.addScore(5); g.spawn("gem", { x: e.x, y: e.y, size: 12, shape: "diamond", color: "good", glow: "good", keep: true, data: { xp: 1 } }); } }
  }
  g.hud.set("Time", `${Math.floor(g.time / 60)}:${String(Math.floor(g.time % 60)).padStart(2, "0")}`);
});

g.draw((ctx, g) => {
  const p = g.data.player, st = g.data.stats;
  for (let i = 0; i < st.blades; i += 1) {
    const ang = g.time * 3 + (i * Math.PI * 2) / st.blades;
    const bx = p.x + Math.cos(ang) * 60 - g.camera.x, by = p.y + Math.sin(ang) * 60 - g.camera.y;
    if (!g.sprite("blade", bx, by, 26, 26, { rot: g.time * 10 })) {
      ctx.save(); ctx.translate(bx, by); ctx.rotate(g.time * 10);
      ctx.fillStyle = g.pal.secondary; ctx.fillRect(-11, -3, 22, 6); ctx.fillRect(-3, -11, 6, 22);
      ctx.restore();
    }
  }
  // XP bar
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(0, g.H - 10, g.W, 10);
  ctx.fillStyle = g.pal.good; ctx.fillRect(0, g.H - 10, g.W * (g.data.xp / g.data.xpNeed), 10);
  if (g.data.choices) {
    g.panel(24, g.H * 0.26, g.W - 48, 300, { r: 22, fill: "rgba(14,10,36,0.9)" });
    g.text("LEVEL UP!", g.W / 2, g.H * 0.26 + 40, { font: "display", size: 30, align: "center", baseline: "middle", gradient: ["#ffffff", g.pal.primary] });
    g.data.choices.forEach((u, i) => g.button(u.id, { x: g.W / 2, y: g.H * 0.26 + 105 + i * 70, w: g.W - 90, h: 56, label: u.label, color: ["accent", "secondary", "good"][i], size: 18, font: "ui" }));
  }
});
