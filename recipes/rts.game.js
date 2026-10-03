// Recipe: rts — simple lane war: gold flows in; spend it on soldiers, archers
// and tanks that march up the lane and fight automatically; upgrade your mine
// for more income. Destroy the enemy base; protect yours. Enemy AI scales.
const TUNING = { gold: 60, income: 6, mineCost: 80, baseHp: 300, enemyBaseHp: 300, hpPerLevel: 120 };
const UNITS = {
  soldier: { cost: 25, hp: 40, dmg: 8, range: 26, speed: 46, every: 0.8, size: 32, color: "secondary" },
  archer: { cost: 40, hp: 26, dmg: 7, range: 130, speed: 40, every: 1.0, size: 30, color: "good" },
  tank: { cost: 80, hp: 140, dmg: 18, range: 30, speed: 28, every: 1.4, size: 46, color: "primary" }
};

const g = KULT.game({
  title: "Lane Lords",
  hint: "Spend gold on units — they march and fight on their own. Destroy the enemy base!",
  lives: 0,
  background: { deco: "hills" },
  hud: { level: true }
});

const baseY = (g, team) => (team === 1 ? g.H - 190 : 130);

function spawnUnit(g, type, team) {
  const u = UNITS[type];
  const scale = team === -1 ? 1 + (g.level - 1) * 0.15 : 1;
  const e = g.spawn(team === 1 ? type : `enemy_${type}`, {
    x: g.W / 2 + g.range(-40, 40), y: baseY(g, team) + (team === 1 ? -30 : 30), h: u.size, shape: "blob", face: true,
    color: team === 1 ? u.color : "danger", hp: Math.round(u.hp * scale), keep: true, tags: [team === 1 ? "ally" : "foe"],
    data: { type, team, cd: 0, dmg: Math.round(u.dmg * scale), maxHp: Math.round(u.hp * scale) }
  });
  e.flipX = false;
}

function hitBase(g, team, dmg) {
  if (team === 1) { g.data.myBase -= dmg; g.shake(3, 0.1); if (g.data.myBase <= 0) g.over({ title: "BASE DESTROYED" }); }
  else {
    g.data.foeBase -= dmg; g.addScore(dmg);
    if (g.data.foeBase <= 0 && !g.data.won) {
      g.data.won = true;
      g.addScore(500 * g.level, g.W / 2, baseY(g, -1));
      g.burst(g.W / 2, baseY(g, -1), { color: ["primary", "danger"], count: 60, speed: 320 });
      g.sfx("win");
      g.after(1.5, () => {
        g.nextLevel(); g.clear("ally"); g.clear("foe");
        g.data.foeBase = TUNING.enemyBaseHp + (g.level - 1) * TUNING.hpPerLevel; g.data.foeMax = g.data.foeBase;
        g.data.myBase = TUNING.baseHp; g.data.won = false;
      });
    }
  }
}

g.setup((g) => {
  g.data.gold = TUNING.gold;
  g.data.income = TUNING.income;
  g.data.mineLvl = 1;
  g.data.myBase = TUNING.baseHp;
  g.data.foeBase = TUNING.enemyBaseHp;
  g.data.foeMax = TUNING.enemyBaseHp;
  g.data.won = false;
  g.every(() => Math.max(1.6, 4 - g.level * 0.35), () => {
    if (g.data.won) return;
    const roll = g.rand();
    spawnUnit(g, roll < 0.55 ? "soldier" : roll < 0.85 ? "archer" : "tank", -1);
  });
});

g.update((g, dt) => {
  g.data.gold += g.data.income * dt;
  g.hud.set("Gold", Math.floor(g.data.gold));
  const buy = g.input.button;
  if (buy && UNITS[buy] && g.data.gold >= UNITS[buy].cost) { g.data.gold -= UNITS[buy].cost; spawnUnit(g, buy, 1); g.sfx("click"); }
  if (buy === "mine" && g.data.gold >= TUNING.mineCost * g.data.mineLvl) { g.data.gold -= TUNING.mineCost * g.data.mineLvl; g.data.mineLvl += 1; g.data.income += 4; g.sfx("power"); }

  const all = [...g.all("ally"), ...g.all("foe")];
  for (const e of all) {
    const d = e.data, u = UNITS[d.type];
    d.cd -= dt;
    const enemies = all.filter((o) => o.data.team !== d.team && !o.dead);
    let target = null, best = Infinity;
    for (const o of enemies) { const dist = Math.abs(o.y - e.y); if (dist < best) { best = dist; target = o; } }
    const baseDist = Math.abs(baseY(g, -d.team) - e.y);
    if (target && best <= u.range) {
      e.vy = 0;
      if (d.cd <= 0) {
        d.cd = u.every;
        if (d.type === "archer") g.spawn("arrow", { x: e.x, y: e.y, w: 3, h: 14, color: "text", vy: -d.team * 420, ttl: best / 420, pop: false, sprite: null });
        if (target.hit(d.dmg)) { if (d.team === 1) { g.addScore(10, target.x, target.y); g.data.gold += 5; } g.sfx("explode"); } else g.sfx("hit");
        e.squash = 0.2;
      }
    } else if (baseDist <= u.range + 20) {
      e.vy = 0;
      if (d.cd <= 0) { d.cd = u.every; hitBase(g, -d.team, d.dmg); e.squash = 0.2; }
    } else {
      e.vy = -d.team * u.speed;
      e.x = g.lerp(e.x, g.W / 2 + Math.sin(e.id) * 50, Math.min(1, dt));
    }
  }
});

function baseBar(ctx, g, y, hp, max, color) {
  g.panel(g.W / 2 - 90, y, 180, 14, { r: 7 });
  ctx.fillStyle = color; ctx.fillRect(g.W / 2 - 88, y + 2, 176 * Math.max(0, hp / max), 10);
}

g.drawBehind((ctx, g) => {
  ctx.fillStyle = "rgba(201,166,107,0.35)"; ctx.fillRect(g.W / 2 - 80, 120, 160, g.H - 300);
  for (const team of [1, -1]) {
    const y = baseY(g, team);
    if (!g.sprite(team === 1 ? "base" : "enemy_base", g.W / 2, y, 140, 100)) {
      ctx.fillStyle = team === 1 ? g.pal.secondary : g.pal.danger;
      ctx.fillRect(g.W / 2 - 60, y - 34, 120, 68);
      ctx.strokeStyle = "rgba(14,10,32,0.9)"; ctx.lineWidth = 4; ctx.strokeRect(g.W / 2 - 60, y - 34, 120, 68);
      for (let i = -2; i <= 2; i += 1) ctx.fillRect(g.W / 2 + i * 24 - 8, y - 48, 16, 14);
    }
  }
});

g.draw((ctx, g) => {
  baseBar(ctx, g, baseY(g, -1) - 64, g.data.foeBase, g.data.foeMax, g.pal.danger);
  baseBar(ctx, g, baseY(g, 1) + 46, g.data.myBase, TUNING.baseHp, g.pal.good);
  for (const e of [...g.all("ally"), ...g.all("foe")]) {
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(e.x - 14, e.y - e.h / 2 - 8, 28, 4);
    ctx.fillStyle = e.data.team === 1 ? g.pal.good : g.pal.danger; ctx.fillRect(e.x - 14, e.y - e.h / 2 - 8, 28 * Math.max(0, e.hp / e.data.maxHp), 4);
  }
  const by = g.H - 64, gold = g.data.gold;
  const types = Object.keys(UNITS);
  types.forEach((t, i) => g.button(t, { x: 50 + i * 90, y: by, w: 84, h: 56, label: `${t.toUpperCase()} ${UNITS[t].cost}`, color: UNITS[t].color, size: 11, font: "ui", disabled: gold < UNITS[t].cost }));
  g.button("mine", { x: g.W - 46, y: by, w: 76, h: 56, label: `MINE ${TUNING.mineCost * g.data.mineLvl}`, color: "accent", size: 11, font: "ui", disabled: gold < TUNING.mineCost * g.data.mineLvl });
});
