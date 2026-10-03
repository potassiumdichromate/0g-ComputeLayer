// Recipe: slingshot — physics puzzle: drag back and release to launch a
// projectile in an arc; knock out the targets sheltered in block towers.
// Blocks take damage and fall when what holds them up breaks. 3 shots a level.
const TUNING = { gravity: 900, power: 6.2, maxPull: 110, shots: 3, blockHp: 2, restitution: 0.45 };

const g = KULT.game({
  title: "Sling Siege",
  hint: "Drag back from the sling and release to launch. Knock out every target!",
  lives: 0,
  background: { deco: "clouds" },
  hud: { level: true }
});

const groundY = (g) => g.H - 70;
const sling = (g) => ({ x: 70, y: groundY(g) - 90 });

function buildLevel(g) {
  const gy = groundY(g);
  g.data.objs = [];
  const towers = Math.min(3, 1 + Math.floor((g.level - 1) / 2) + 1);
  for (let t = 0; t < towers; t += 1) {
    const baseX = g.W * 0.55 + t * 62 - (towers - 1) * 20;
    const floors = g.randInt(1, Math.min(3, 1 + g.level));
    let y = gy;
    for (let f = 0; f < floors; f += 1) {
      g.data.objs.push({ type: "block", x: baseX, y: y - 30, w: 22, h: 60, vy: 0, hp: TUNING.blockHp });
      g.data.objs.push({ type: "block", x: baseX + 40, y: y - 30, w: 22, h: 60, vy: 0, hp: TUNING.blockHp });
      g.data.objs.push({ type: "block", x: baseX + 20, y: y - 68, w: 70, h: 16, vy: 0, hp: TUNING.blockHp });
      y -= 76;
    }
    g.data.objs.push({ type: "target", x: baseX + 20, y: y - 18, w: 34, h: 34, vy: 0, hp: 1 });
  }
  g.data.shots = TUNING.shots;
  g.data.proj = null;
}

const overlap = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

function settle(g, dt) {
  const gy = groundY(g);
  const objs = g.data.objs.filter((o) => o.hp > 0).sort((a, b) => b.y - a.y);
  for (const o of objs) {
    o.vy += TUNING.gravity * dt;
    o.y += o.vy * dt;
    if (o.y + o.h / 2 > gy) { o.y = gy - o.h / 2; if (o.vy > 400 && o.type === "target") damage(g, o); o.vy = 0; }
    for (const s of objs) {
      if (s === o || s.y <= o.y) continue;
      if (Math.abs(o.x - s.x) < (o.w + s.w) / 2 - 2 && o.y + o.h / 2 > s.y - s.h / 2 && o.y < s.y) {
        if (o.vy > 450 && o.type === "target") damage(g, o);
        o.y = s.y - s.h / 2 - o.h / 2; o.vy = 0;
      }
    }
  }
}

function damage(g, o) {
  if (o.hp <= 0) return;
  o.hp -= 1;
  o.flash = 0.15;
  if (o.hp <= 0) {
    if (o.type === "target") { g.addScore(500, o.x, o.y - 20); g.sfx("explode"); g.burst(o.x, o.y, { color: ["danger", "primary"], count: 26 }); }
    else { g.addScore(50, o.x, o.y); g.sfx("hit"); g.burst(o.x, o.y, { color: "#c98a4b", count: 12 }); }
  }
}

g.setup((g) => { buildLevel(g); g.data.aim = null; });

g.update((g, dt) => {
  const S = sling(g);
  g.hud.set("Shots", g.data.shots);
  const targets = g.data.objs.filter((o) => o.type === "target" && o.hp > 0).length;
  if (!g.data.proj) {
    if (g.input.down) {
      const dx = g.input.x - S.x, dy = g.input.y - S.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, TUNING.maxPull / d);
      g.data.aim = { x: S.x + dx * k, y: S.y + dy * k };
    }
    const launch = g.input.released && g.data.aim;
    const keyLaunch = g.input.action;
    if ((launch || keyLaunch) && g.data.shots > 0) {
      const a = g.data.aim || { x: S.x - 80, y: S.y + 50 };
      g.data.proj = { x: a.x, y: a.y, vx: (S.x - a.x) * TUNING.power, vy: (S.y - a.y) * TUNING.power, r: 14, rot: 0, life: 6 };
      g.data.shots -= 1; g.data.aim = null;
      g.sfx("flap");
    }
  } else {
    const p = g.data.proj;
    p.vy += TUNING.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vx * dt * 0.05; p.life -= dt;
    const box = { x: p.x, y: p.y, w: p.r * 2, h: p.r * 2 };
    for (const o of g.data.objs) {
      if (o.hp <= 0 || !overlap(box, o)) continue;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 120) damage(g, o);
      if (o.type === "block" && o.hp > 0) {
        const fromSide = Math.abs(p.x - o.x) / o.w > Math.abs(p.y - o.y) / o.h;
        if (fromSide) { p.vx = -p.vx * TUNING.restitution; p.x = o.x + Math.sign(p.x - o.x) * (o.w / 2 + p.r); }
        else { p.vy = -p.vy * TUNING.restitution; p.y = o.y + Math.sign(p.y - o.y) * (o.h / 2 + p.r); }
        o.x += Math.sign(o.x - p.x) * Math.min(14, speed * 0.02);
      }
    }
    if (p.y + p.r > groundY(g)) { p.y = groundY(g) - p.r; p.vy = -p.vy * 0.35; p.vx *= 0.7; }
    if (p.life <= 0 || p.x > g.W + 60 || (Math.abs(p.vx) < 20 && Math.abs(p.vy) < 30 && p.y > groundY(g) - p.r - 2)) {
      g.data.proj = null;
      if (targets > 0 && g.data.shots <= 0) g.after(1.2, () => { if (g.data.objs.some((o) => o.type === "target" && o.hp > 0)) g.over({ title: "OUT OF SHOTS" }); });
    }
  }
  settle(g, dt);
  for (const o of g.data.objs) if (o.flash > 0) o.flash -= dt;
  if (targets === 0 && !g.data.clearing) {
    g.data.clearing = true;
    g.addScore(g.data.shots * 300, g.W / 2, g.H * 0.3);
    g.sfx("win");
    g.after(1.2, () => { g.nextLevel(); buildLevel(g); g.data.clearing = false; });
  }
});

g.drawBehind((ctx, g) => {
  const gy = groundY(g);
  ctx.fillStyle = g.shade(g.pal.good, -0.35); ctx.fillRect(0, gy, g.W, g.H - gy);
  ctx.fillStyle = g.pal.good; ctx.fillRect(0, gy, g.W, 8);
});

g.draw((ctx, g) => {
  const S = sling(g);
  ctx.strokeStyle = "#7a4a1f"; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(S.x, groundY(g)); ctx.lineTo(S.x, S.y + 10); ctx.lineTo(S.x - 14, S.y - 14); ctx.moveTo(S.x, S.y + 10); ctx.lineTo(S.x + 14, S.y - 14); ctx.stroke();
  for (const o of g.data.objs) {
    if (o.hp <= 0) continue;
    if (o.type === "target") {
      if (!g.sprite("target", o.x, o.y, o.w * 1.3, o.h * 1.3)) {
        ctx.fillStyle = o.flash > 0 ? "#ffffff" : g.pal.accent; ctx.beginPath(); ctx.arc(o.x, o.y, o.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(14,10,32,0.9)"; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = "#1b1733"; ctx.beginPath(); ctx.arc(o.x - 6, o.y - 3, 3, 0, Math.PI * 2); ctx.arc(o.x + 6, o.y - 3, 3, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.fillStyle = o.flash > 0 ? "#ffffff" : o.hp < TUNING.blockHp ? "#a0703c" : "#c98a4b";
      ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      ctx.strokeStyle = "rgba(14,10,32,0.85)"; ctx.lineWidth = 2; ctx.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
    }
  }
  const p = g.data.proj || (g.data.aim ? { x: g.data.aim.x, y: g.data.aim.y, rot: 0, r: 14 } : g.data.shots > 0 ? { x: S.x, y: S.y, rot: 0, r: 14 } : null);
  if (g.data.aim) {
    ctx.strokeStyle = "#5a2d0c"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(S.x - 14, S.y - 14); ctx.lineTo(g.data.aim.x, g.data.aim.y); ctx.lineTo(S.x + 14, S.y - 14); ctx.stroke();
    let x = g.data.aim.x, y = g.data.aim.y, vx = (S.x - x) * TUNING.power, vy = (S.y - y) * TUNING.power;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 14; i += 1) { vy += TUNING.gravity * 0.05; x += vx * 0.05; y += vy * 0.05; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
  }
  if (p && !g.sprite("player", p.x, p.y, p.r * 2.6, p.r * 2.6, { rot: p.rot })) {
    ctx.fillStyle = g.pal.danger; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(14,10,32,0.9)"; ctx.lineWidth = 3; ctx.stroke();
  }
});
