// Recipe: turnbased — classic RPG duel: ATTACK, SKILL (costs MP), DEFEND
// (halves damage, restores MP) or POTION; the monster answers with attacks,
// crits and misses. Win to level up, heal partly and face a stronger monster.
const TUNING = { hp: 60, mp: 20, atk: 9, skillCost: 8, skillMult: 2.4, potions: 3, monsterHp: 45, monsterAtk: 8, growth: 1.22 };
const MONSTERS = ["Slime King", "Bone Knight", "Fire Wyrm", "Shadow Golem", "Storm Hydra"];

const g = KULT.game({
  title: "Hero's Duel",
  hint: "Pick ATTACK, SKILL, DEFEND or POTION each turn. Outlast the monster!",
  lives: 0,
  background: { deco: "hills" },
  hud: { level: true }
});

function newMonster(g) {
  const k = Math.pow(TUNING.growth, g.level - 1);
  g.data.mon = { name: MONSTERS[(g.level - 1) % MONSTERS.length], hp: Math.round(TUNING.monsterHp * k), maxHp: Math.round(TUNING.monsterHp * k), atk: Math.round(TUNING.monsterAtk * k), shake: 0, lunge: 0 };
  g.data.log = `A wild ${g.data.mon.name} appears!`;
}

function hitMonster(g, dmg, label) {
  const m = g.data.mon;
  m.hp = Math.max(0, m.hp - dmg); m.shake = 0.3;
  g.floatText(g.W / 2, g.H * 0.26, `-${dmg}`, label === "SKILL" ? "primary" : "danger", label === "SKILL" ? 34 : 26);
  g.burst(g.W / 2, g.H * 0.28, { color: label === "SKILL" ? ["primary", "accent"] : "danger", count: label === "SKILL" ? 30 : 12 });
  g.sfx(label === "SKILL" ? "explode" : "hit");
}

function monsterTurn(g) {
  const m = g.data.mon, h = g.data.hero;
  m.lunge = 0.35;
  const roll = g.rand();
  if (roll < 0.12) { g.data.log = `${m.name} misses!`; g.sfx("flap"); }
  else {
    const crit = roll > 0.88;
    let dmg = Math.round(m.atk * g.range(0.85, 1.15) * (crit ? 1.8 : 1));
    if (h.defending) dmg = Math.ceil(dmg / 2);
    h.hp = Math.max(0, h.hp - dmg);
    g.data.log = `${m.name} ${crit ? "lands a CRITICAL hit" : "attacks"} for ${dmg}!`;
    g.shake(crit ? 9 : 5, 0.25); g.flash("danger", crit ? 0.3 : 0.15); g.sfx("hit");
  }
  h.defending = false;
  if (h.hp <= 0) g.after(0.6, () => g.over({ title: "THE HERO FALLS" }));
  else g.data.turn = "hero";
}

function act(g, action) {
  const h = g.data.hero, m = g.data.mon;
  if (action === "attack") { const crit = g.chance(0.15); const dmg = Math.round(h.atk * g.range(0.9, 1.1) * (crit ? 2 : 1)); hitMonster(g, dmg, "ATTACK"); g.data.log = crit ? `Critical strike! ${dmg} damage.` : `You strike for ${dmg}.`; }
  else if (action === "skill") { if (h.mp < TUNING.skillCost) { g.data.log = "Not enough MP!"; return; } h.mp -= TUNING.skillCost; const dmg = Math.round(h.atk * TUNING.skillMult); hitMonster(g, dmg, "SKILL"); g.shake(6, 0.25); g.data.log = `Arcane blast! ${dmg} damage.`; }
  else if (action === "defend") { h.defending = true; h.mp = Math.min(h.maxMp, h.mp + 5); g.data.log = "You brace yourself (+5 MP)."; g.sfx("power"); }
  else if (action === "potion") { if (h.potions <= 0) { g.data.log = "No potions left!"; return; } h.potions -= 1; const heal = Math.round(h.maxHp * 0.4); h.hp = Math.min(h.maxHp, h.hp + heal); g.floatText(g.W / 2, g.H * 0.62, `+${heal}`, "good", 26); g.data.log = `You drink a potion (+${heal} HP).`; g.sfx("power"); }
  g.data.turn = "monster";
  if (m.hp <= 0) {
    g.data.log = `${m.name} is defeated!`;
    g.addScore(100 * g.level, g.W / 2, g.H * 0.2);
    g.burst(g.W / 2, g.H * 0.28, { color: ["primary", "good", "accent"], count: 50, speed: 300 });
    g.sfx("win");
    g.after(1.4, () => {
      g.nextLevel();
      h.maxHp += 10; h.atk += 2; h.maxMp += 2;
      h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.5)); h.mp = h.maxMp; h.potions = Math.min(5, h.potions + 1);
      newMonster(g); g.data.turn = "hero";
    });
    return;
  }
  g.after(0.8, () => monsterTurn(g));
}

g.setup((g) => {
  g.data.hero = { hp: TUNING.hp, maxHp: TUNING.hp, mp: TUNING.mp, maxMp: TUNING.mp, atk: TUNING.atk, potions: TUNING.potions, defending: false };
  g.data.turn = "hero";
  newMonster(g);
});

g.update((g, dt) => {
  const m = g.data.mon;
  m.shake = Math.max(0, m.shake - dt); m.lunge = Math.max(0, m.lunge - dt);
  if (g.data.turn === "hero" && g.input.button) act(g, g.input.button);
});

function bar(ctx, g, x, y, w, value, max, color, label) {
  g.panel(x, y, w, 18, { r: 9 });
  ctx.fillStyle = color; ctx.fillRect(x + 2, y + 2, (w - 4) * Math.max(0, value / max), 14);
  g.text(`${label} ${Math.max(0, Math.round(value))}/${max}`, x + w / 2, y + 10, { size: 11, align: "center", baseline: "middle", stroke: false });
}

g.draw((ctx, g) => {
  const m = g.data.mon, h = g.data.hero;
  const mx = g.W / 2 + (m.shake > 0 ? Math.sin(g.time * 70) * 7 : 0), my = g.H * 0.28 + (m.lunge > 0 ? Math.sin((m.lunge / 0.35) * Math.PI) * 60 : 0);
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(g.W / 2, g.H * 0.28 + 80, 70, 14, 0, 0, Math.PI * 2); ctx.fill();
  if (!g.sprite("monster", mx, my, 170, 170)) {
    ctx.fillStyle = g.pal.accent; ctx.beginPath(); ctx.ellipse(mx, my, 70, 60, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(14,10,32,0.9)"; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(mx - 22, my - 12, 12, 0, Math.PI * 2); ctx.arc(mx + 22, my - 12, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g.pal.danger; ctx.beginPath(); ctx.arc(mx - 20, my - 10, 6, 0, Math.PI * 2); ctx.arc(mx + 24, my - 10, 6, 0, Math.PI * 2); ctx.fill();
  }
  g.text(m.name.toUpperCase(), g.W / 2, g.H * 0.1 + 4, { font: "display", size: 22, align: "center", baseline: "middle" });
  bar(ctx, g, g.W / 2 - 100, g.H * 0.1 + 22, 200, m.hp, m.maxHp, g.pal.danger, "HP");
  // Hero panel
  const py = g.H * 0.56;
  if (!g.sprite("player", 64, py + 30, 90, 90)) {
    ctx.fillStyle = g.pal.primary; ctx.beginPath(); ctx.arc(64, py + 30, 32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(14,10,32,0.9)"; ctx.lineWidth = 3; ctx.stroke();
  }
  if (h.defending) { ctx.strokeStyle = g.pal.secondary; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(64, py + 30, 44, 0, Math.PI * 2); ctx.stroke(); }
  bar(ctx, g, 118, py + 6, g.W - 136, h.hp, h.maxHp, g.pal.good, "HP");
  bar(ctx, g, 118, py + 32, g.W - 136, h.mp, h.maxMp, g.pal.secondary, "MP");
  g.panel(16, py + 82, g.W - 32, 40, { r: 12 });
  g.wrapText(g.data.log, g.W / 2, py + 102, g.W - 52, { size: 13, align: "center", stroke: false, maxLines: 2 });
  const by = g.H - 130, dis = g.data.turn !== "hero";
  g.button("attack", { x: g.W / 2 - 84, y: by, w: 156, h: 50, label: "ATTACK", color: "danger", size: 17, disabled: dis });
  g.button("skill", { x: g.W / 2 + 84, y: by, w: 156, h: 50, label: `SKILL ${TUNING.skillCost}MP`, color: "accent", size: 15, disabled: dis || h.mp < TUNING.skillCost });
  g.button("defend", { x: g.W / 2 - 84, y: by + 62, w: 156, h: 50, label: "DEFEND", color: "secondary", size: 17, disabled: dis });
  g.button("potion", { x: g.W / 2 + 84, y: by + 62, w: 156, h: 50, label: `POTION x${h.potions}`, color: "good", size: 15, disabled: dis || h.potions <= 0 });
});
