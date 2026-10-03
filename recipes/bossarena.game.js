// Recipe: bossarena — top-down duel with one big boss: you auto-attack while
// in range; the boss telegraphs charges, ground slams and projectile rings;
// tap to dash (invulnerable) out of danger. Phases speed up as its HP drops.
const TUNING = { speed: 175, dash: 520, dashTime: 0.18, dashCd: 0.7, attackEvery: 0.35, attackRange: 210, bossHp: 60, hpPerLevel: 30 };

const g = KULT.game({
  title: "Titan Clash",
  hint: "Drag to move, TAP to dash through attacks. Red zones = danger!",
  lives: 4,
  background: { deco: "grid" },
  hud: { level: true }
});

function spawnBoss(g) {
  const hp = TUNING.bossHp + (g.level - 1) * TUNING.hpPerLevel;
  g.data.boss = g.spawn("boss", { x: g.W / 2, y: g.H * 0.3, h: 110, shape: "blob", face: true, color: "danger", hp, keep: true, z: 2, data: { maxHp: hp, state: "idle", t: 1.2, tx: 0, ty: 0 } });
  g.data.telegraphs = [];
}

function bossThink(g, b, dt) {
  const d = b.data, p = g.data.player;
  const rage = b.hp < d.maxHp / 3 ? 1.5 : b.hp < (d.maxHp * 2) / 3 ? 1.2 : 1;
  d.t -= dt * rage;
  if (d.state === "idle") {
    b.moveToward(p.x, p.y, 40);
    if (d.t <= 0) {
      d.state = g.pick(["charge", "slam", "ring"]);
      d.t = 0.9;
      if (d.state === "charge") { d.tx = p.x; d.ty = p.y; g.data.telegraphs.push({ kind: "line", x1: b.x, y1: b.y, x2: p.x, y2: p.y, t: 0.9 }); }
      if (d.state === "slam") { d.tx = p.x; d.ty = p.y; g.data.telegraphs.push({ kind: "circle", x: p.x, y: p.y, r: 90, t: 0.9 }); }
      if (d.state === "ring") g.data.telegraphs.push({ kind: "circle", x: b.x, y: b.y, r: 70, t: 0.9 });
      b.vx = 0; b.vy = 0;
    }
    return;
  }
  if (d.t > 0) { b.flash(0.03); return; }
  if (d.state === "charge") {
    const a = Math.atan2(d.ty - b.y, d.tx - b.x);
    b.vx = Math.cos(a) * 640; b.vy = Math.sin(a) * 640;
    g.sfx("shoot");
    d.state = "recover"; d.t = 0.55;
  } else if (d.state === "slam") {
    b.x = d.tx; b.y = d.ty;
    g.shake(10, 0.3); g.sfx("explode");
    g.burst(b.x, b.y, { color: "danger", count: 40, speed: 280 });
    if (Math.hypot(p.x - d.tx, p.y - d.ty) < 90 && !g.data.dashing) hurt(g);
    d.state = "recover"; d.t = 0.9;
  } else if (d.state === "ring") {
    const n = 12 + g.level * 2;
    for (let i = 0; i < n; i += 1) {
      const a = (i * Math.PI * 2) / n;
      g.spawn("orb", { x: b.x, y: b.y, r: 8, shape: "circle", color: "accent", glow: "accent", vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, ttl: 3, bounds: "kill", tags: ["hazard"], pop: false });
    }
    g.sfx("power");
    d.state = "recover"; d.t = 0.7;
  } else if (d.state === "recover") {
    b.vx *= 0.9; b.vy *= 0.9;
    d.state = "idle"; d.t = g.range(0.8, 1.5);
  }
}

function hurt(g) {
  const p = g.data.player;
  if (p.invuln > 0 || g.data.dashing) return;
  p.invuln = 1.3;
  g.loseLife({ title: "CRUSHED" });
}

g.setup((g) => {
  g.data.player = g.spawn("player", { x: g.W / 2, y: g.H * 0.75, h: 46, shape: "blob", face: true, color: "primary", keep: true, bounds: "clamp", shadow: true, z: 3 });
  g.data.dashT = 0; g.data.dashCd = 0; g.data.dashing = false; g.data.atkCd = 0;
  spawnBoss(g);
  g.onHit("player", "hazard", (p, o) => { if (g.data.dashing || p.invuln > 0) return; o.kill(); hurt(g); });
  g.onHit("player", "boss", () => { if (g.data.boss.data.state === "recover") hurt(g); });
  g.onHit("slash", "boss", (s, b) => {
    s.kill();
    if (b.hit(1)) {
      g.addScore(500 * g.level, b.x, b.y);
      g.burst(b.x, b.y, { color: ["danger", "primary"], count: 60, speed: 320, life: 1.2 });
      g.shake(14, 0.5); g.sfx("explode"); g.clear("hazard");
      g.data.telegraphs = [];
      g.after(1.5, () => { g.nextLevel(); spawnBoss(g); });
    } else { g.addScore(5); g.sfx("hit"); }
  });
});

g.update((g, dt) => {
  const p = g.data.player, b = g.data.boss;
  const a = g.input.axis();
  g.data.dashCd -= dt;
  if (g.data.dashing) {
    g.data.dashT -= dt;
    if (g.data.dashT <= 0) g.data.dashing = false;
    g.burst(p.x, p.y, { color: "secondary", count: 1, speed: 20, gravity: 0, life: 0.3 });
  } else {
    p.vx = g.lerp(p.vx, a.x * TUNING.speed, Math.min(1, dt * 12));
    p.vy = g.lerp(p.vy, a.y * TUNING.speed, Math.min(1, dt * 12));
    if ((g.input.taps.length || g.input.action) && g.data.dashCd <= 0) {
      const dir = Math.hypot(p.vx, p.vy) > 10 ? Math.atan2(p.vy, p.vx) : Math.atan2(p.y - b.y, p.x - b.x);
      p.vx = Math.cos(dir) * TUNING.dash; p.vy = Math.sin(dir) * TUNING.dash;
      g.data.dashing = true; g.data.dashT = TUNING.dashTime; g.data.dashCd = TUNING.dashCd;
      g.sfx("flap");
    }
  }
  if (b && !b.dead) {
    bossThink(g, b, dt);
    b.x = g.clamp(b.x, 60, g.W - 60); b.y = g.clamp(b.y, 120, g.H - 80);
    g.data.atkCd -= dt;
    const dist = Math.hypot(b.x - p.x, b.y - p.y);
    if (g.data.atkCd <= 0 && dist < TUNING.attackRange) {
      g.data.atkCd = TUNING.attackEvery;
      const ang = Math.atan2(b.y - p.y, b.x - p.x);
      g.spawn("slash", { x: p.x, y: p.y, w: 10, h: 24, shape: "capsule", color: "primary", glow: "primary", vx: Math.cos(ang) * 600, vy: Math.sin(ang) * 600, rot: ang + Math.PI / 2, ttl: 0.4, pop: false });
    }
    g.hud.set("Boss", `${Math.max(0, Math.round((b.hp / b.data.maxHp) * 100))}%`);
  }
  for (const t of g.data.telegraphs) t.t -= dt;
  g.data.telegraphs = g.data.telegraphs.filter((t) => t.t > 0);
});

g.drawBehind((ctx, g) => {
  for (const t of g.data.telegraphs) {
    const k = 1 - t.t / 0.9;
    ctx.globalAlpha = 0.25 + k * 0.35;
    ctx.fillStyle = g.pal.danger; ctx.strokeStyle = g.pal.danger;
    if (t.kind === "circle") { ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.9; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(t.x, t.y, t.r * k, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.lineWidth = 40; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
});

g.draw((ctx, g) => {
  const b = g.data.boss;
  if (b && !b.dead) {
    const w = g.W - 60, frac = b.hp / b.data.maxHp;
    g.panel(30, 92, w, 12, { r: 6 });
    ctx.fillStyle = g.pal.danger; ctx.fillRect(32, 94, (w - 4) * frac, 8);
  }
  if (g.data.dashCd > 0) {
    const p = g.data.player;
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y + 34, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - g.data.dashCd / TUNING.dashCd)); ctx.stroke();
  }
});
