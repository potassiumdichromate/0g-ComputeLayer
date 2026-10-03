// Recipe: towerdefense — enemies walk a winding path; tap build spots to place
// or upgrade towers with coins; waves grow; leaks cost lives.
const TUNING = { coins: 120, towerCost: 50, upgradeCost: 60, range: 92, fireEvery: 0.7, damage: 1, waveGap: 4, enemyHp: 3, enemySpeed: 46, bounty: 8 };

const g = KULT.game({
  title: "Garden Guard",
  hint: "Tap a glowing spot to build a tower (50 coins). Tap a tower to upgrade it.",
  lives: 5,
  background: { deco: "hills" },
  hud: { level: true }
});

// Path as fractions of the screen so it fits any height.
const PATH = [[0.5, -0.05], [0.5, 0.18], [0.18, 0.18], [0.18, 0.42], [0.82, 0.42], [0.82, 0.66], [0.3, 0.66], [0.3, 0.9], [0.5, 0.9], [0.5, 1.05]];
const SPOTS = [[0.34, 0.1], [0.66, 0.26], [0.06, 0.3], [0.5, 0.3], [0.5, 0.54], [0.94, 0.54], [0.6, 0.78], [0.14, 0.78], [0.66, 0.96]];

function pathPts(g) { return PATH.map(([x, y]) => ({ x: x * g.W, y: y * g.H })); }

function spawnEnemy(g, wave) {
  const pts = pathPts(g);
  const tough = wave >= 3 && g.chance(0.25);
  const e = g.spawn(tough ? "brute" : "enemy", {
    x: pts[0].x, y: pts[0].y, h: tough ? 44 : 34, shape: "blob", face: true, color: tough ? "danger" : "accent",
    hp: Math.round((tough ? 3 : 1) * (TUNING.enemyHp + wave)), tags: ["enemy"], keep: true, z: 2,
    data: { wp: 1, speed: TUNING.enemySpeed * (tough ? 0.7 : 1) * (1 + wave * 0.04) }
  });
  e.data.maxHp = e.hp;
}

function startWave(g) {
  g.data.wave += 1;
  const count = 5 + g.data.wave * 2;
  g.data.toSpawn = count;
  g.floatText(g.W / 2, g.H * 0.2, `WAVE ${g.data.wave}`, "primary", 26);
  if (g.data.wave > 1) g.nextLevel();
}

g.setup((g) => {
  g.data.coins = TUNING.coins;
  g.data.wave = 0;
  g.data.toSpawn = 0;
  g.data.spawnCd = 0;
  g.data.waveCd = 1.5;
  g.data.spots = SPOTS.map(([x, y]) => ({ x: x * g.W, y: y * g.H, tower: null }));

  g.onHit("bolt", "enemy", (b, e) => {
    b.kill();
    if (e.hit(b.data.damage)) {
      g.data.coins += TUNING.bounty;
      g.addScore(10, e.x, e.y);
      g.sfx("explode");
    } else g.sfx("hit");
  });
});

g.update((g, dt) => {
  const pts = pathPts(g);
  g.hud.set("Coins", g.data.coins);
  g.hud.set("Wave", g.data.wave);

  // Waves
  if (g.data.toSpawn > 0) {
    g.data.spawnCd -= dt;
    if (g.data.spawnCd <= 0) { spawnEnemy(g, g.data.wave); g.data.toSpawn -= 1; g.data.spawnCd = Math.max(0.45, 1.1 - g.data.wave * 0.05); }
  } else if (g.count("enemy") === 0) {
    g.data.waveCd -= dt;
    if (g.data.waveCd <= 0) { startWave(g); g.data.waveCd = TUNING.waveGap; }
  }

  // Enemies walk the path
  for (const e of g.all("enemy")) {
    const target = pts[e.data.wp];
    if (!target) continue;
    const dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy);
    if (d < 4) {
      e.data.wp += 1;
      if (e.data.wp >= pts.length) { e.kill({ burst: false }); g.loseLife({ title: "THE GARDEN FELL" }); }
      continue;
    }
    e.vx = (dx / d) * e.data.speed; e.vy = (dy / d) * e.data.speed;
    e.flipX = dx < 0;
  }

  // Towers fire at the enemy furthest along the path within range
  for (const s of g.data.spots) {
    const t = s.tower;
    if (!t) continue;
    t.cd -= dt;
    if (t.cd > 0) continue;
    let best = null;
    for (const e of g.all("enemy")) if (Math.hypot(e.x - s.x, e.y - s.y) <= t.range && (!best || e.data.wp > best.data.wp)) best = e;
    if (!best) continue;
    t.cd = t.every;
    const a = Math.atan2(best.y - s.y, best.x - s.x);
    t.angle = a;
    g.spawn("bolt", { x: s.x, y: s.y, r: 5, shape: "circle", color: "primary", glow: "primary", vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, ttl: 0.6, bounds: "kill", pop: false, data: { damage: t.damage } });
    g.sfx("shoot");
  }

  // Build / upgrade
  for (const tap of g.input.taps) {
    const s = g.data.spots.find((q) => Math.hypot(q.x - tap.x, q.y - tap.y) < 30);
    if (!s) continue;
    if (!s.tower && g.data.coins >= TUNING.towerCost) {
      g.data.coins -= TUNING.towerCost;
      s.tower = { level: 1, range: TUNING.range, every: TUNING.fireEvery, damage: TUNING.damage, cd: 0, angle: -Math.PI / 2 };
      g.burst(s.x, s.y, { color: "good", count: 14 });
      g.sfx("power");
    } else if (s.tower && s.tower.level < 3 && g.data.coins >= TUNING.upgradeCost) {
      g.data.coins -= TUNING.upgradeCost;
      s.tower.level += 1; s.tower.range += 18; s.tower.every *= 0.75; s.tower.damage += 1;
      g.burst(s.x, s.y, { color: "primary", count: 18 });
      g.floatText(s.x, s.y - 30, `LV ${s.tower.level}`, "primary", 18);
      g.sfx("level");
    } else {
      g.floatText(s.x, s.y - 26, s.tower && s.tower.level >= 3 ? "MAX" : "NEED COINS", "danger", 14);
    }
  }
});

g.drawBehind((ctx, g) => {
  const pts = pathPts(g);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(14,10,32,0.55)"; ctx.lineWidth = 46;
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  ctx.strokeStyle = g.shade(g.pal.bg2, 0.25); ctx.lineWidth = 38;
  ctx.stroke();
  for (const s of g.data.spots) {
    if (s.tower) continue;
    const can = g.data.coins >= TUNING.towerCost;
    ctx.globalAlpha = can ? 0.55 + Math.sin(g.time * 4) * 0.25 : 0.3;
    ctx.strokeStyle = can ? g.pal.good : "#ffffff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(s.x, s.y, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    g.text("+", s.x, s.y + 1, { size: 18, align: "center", baseline: "middle", stroke: false, color: can ? g.pal.good : "rgba(255,255,255,0.5)" });
  }
});

g.draw((ctx, g) => {
  for (const s of g.data.spots) {
    const t = s.tower;
    if (!t) continue;
    if (!g.sprite("tower", s.x, s.y - 6, 54, 54)) {
      ctx.fillStyle = g.shade(g.pal.secondary, -0.2);
      ctx.beginPath(); ctx.arc(s.x, s.y, 20, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(14,10,32,0.9)"; ctx.lineWidth = 3; ctx.stroke();
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(t.angle + Math.PI / 2);
      ctx.fillStyle = g.pal.primary; ctx.fillRect(-5, -26, 10, 22); ctx.strokeRect(-5, -26, 10, 22);
      ctx.restore();
    }
    for (let i = 0; i < t.level; i += 1) { ctx.fillStyle = g.pal.primary; ctx.beginPath(); ctx.arc(s.x - 10 + i * 10, s.y + 26, 3.5, 0, Math.PI * 2); ctx.fill(); }
  }
  for (const e of g.all("enemy")) {
    const w = 30, frac = Math.max(0, e.hp / e.data.maxHp);
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(e.x - w / 2, e.y - e.h / 2 - 10, w, 5);
    ctx.fillStyle = frac > 0.5 ? g.pal.good : g.pal.danger; ctx.fillRect(e.x - w / 2, e.y - e.h / 2 - 10, w * frac, 5);
  }
});
