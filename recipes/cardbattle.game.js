// Recipe: cardbattle — deck builder: draw 5 cards a turn, spend 3 energy to
// play them (attack, block, heal, draw), read the enemy's intent, end turn.
// Beat an enemy to add 1 of 3 new cards to your deck; enemies get tougher.
const TUNING = { hp: 40, energy: 3, hand: 5, enemyHp: 26, hpPerLevel: 10 };
const CARDS = {
  strike: { name: "Strike", cost: 1, text: "Deal 6 damage", color: "danger", play: (g) => attack(g, 6) },
  defend: { name: "Defend", cost: 1, text: "Gain 5 block", color: "secondary", play: (g) => { g.data.block += 5; } },
  bash: { name: "Bash", cost: 2, text: "Deal 12 damage", color: "accent", play: (g) => attack(g, 12) },
  heal: { name: "Mend", cost: 1, text: "Heal 5 HP", color: "good", play: (g) => { g.data.hp = Math.min(TUNING.hp, g.data.hp + 5); } },
  focus: { name: "Focus", cost: 0, text: "Draw 2 cards", color: "primary", play: (g) => draw(g, 2) },
  flurry: { name: "Flurry", cost: 1, text: "Deal 3 damage 3 times", color: "danger", play: (g) => { attack(g, 3); attack(g, 3); attack(g, 3); } },
  wall: { name: "Iron Wall", cost: 2, text: "Gain 12 block", color: "secondary", play: (g) => { g.data.block += 12; } }
};
const STARTER = ["strike", "strike", "strike", "strike", "defend", "defend", "defend", "bash", "heal", "focus"];
const REWARDS = ["bash", "flurry", "wall", "heal", "focus", "strike"];

const g = KULT.game({
  title: "Spire Cards",
  hint: "Tap cards to play them with your energy, then END TURN. Watch the enemy's intent!",
  lives: 0,
  background: { deco: "dots" },
  hud: { level: true }
});

function shuffle(g, a) { for (let i = a.length - 1; i > 0; i -= 1) { const j = g.randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function draw(g, n) {
  for (let i = 0; i < n; i += 1) {
    if (!g.data.drawPile.length) { g.data.drawPile = shuffle(g, g.data.discard); g.data.discard = []; }
    if (!g.data.drawPile.length || g.data.hand.length >= 8) return;
    g.data.hand.push({ id: g.data.drawPile.pop(), pop: 0.25 });
  }
}

function attack(g, dmg) {
  const e = g.data.enemy;
  const through = Math.max(0, dmg - e.block);
  e.block = Math.max(0, e.block - dmg);
  e.hp -= through;
  e.shake = 0.25;
  g.floatText(g.W / 2, g.H * 0.27, `-${through}`, "danger", 26);
  g.sfx(through > 0 ? "hit" : "bounce");
  g.burst(g.W / 2, g.H * 0.25, { color: "danger", count: 8 + dmg });
}

function newEnemy(g) {
  const hp = TUNING.enemyHp + (g.level - 1) * TUNING.hpPerLevel;
  g.data.enemy = { hp, maxHp: hp, block: 0, shake: 0, intent: null };
  pickIntent(g);
}

function pickIntent(g) {
  const lv = g.level;
  const roll = g.rand();
  g.data.enemy.intent = roll < 0.6 ? { kind: "attack", value: 6 + lv * 2 + g.randInt(0, 3) } : roll < 0.85 ? { kind: "block", value: 6 + lv * 2 } : { kind: "attack", value: 3 + lv, hits: 2 };
}

function startTurn(g) {
  g.data.energy = TUNING.energy;
  g.data.block = 0;
  draw(g, TUNING.hand);
}

function endTurn(g) {
  g.data.discard.push(...g.data.hand.map((c) => c.id));
  g.data.hand = [];
  const e = g.data.enemy, it = e.intent;
  e.block = 0;
  if (it.kind === "block") { e.block = it.value; g.sfx("power"); }
  else {
    for (let i = 0; i < (it.hits || 1); i += 1) {
      const through = Math.max(0, it.value - g.data.block);
      g.data.block = Math.max(0, g.data.block - it.value);
      g.data.hp -= through;
      if (through > 0) { g.shake(6, 0.25); g.flash("danger", 0.2); }
    }
    g.sfx("hit");
  }
  if (g.data.hp <= 0) { g.over({ title: "DEFEATED" }); return; }
  pickIntent(g);
  startTurn(g);
}

g.setup((g) => {
  g.data.deck = STARTER.slice();
  g.data.drawPile = shuffle(g, g.data.deck.slice());
  g.data.discard = [];
  g.data.hand = [];
  g.data.hp = TUNING.hp;
  g.data.reward = null;
  newEnemy(g);
  startTurn(g);
});

function cardRects(g) {
  const n = g.data.hand.length, w = Math.min(84, (g.W - 20) / Math.max(1, n) - 6), h = 118;
  const total = n * (w + 6) - 6, x0 = (g.W - total) / 2, y = g.H - h / 2 - 82;
  return g.data.hand.map((c, i) => ({ x: x0 + i * (w + 6) + w / 2, y, w, h }));
}

g.update((g, dt) => {
  const e = g.data.enemy;
  e.shake = Math.max(0, e.shake - dt);
  for (const c of g.data.hand) if (c.pop > 0) c.pop -= dt;
  if (g.data.reward) {
    const pick = g.data.reward.find((id) => g.input.button === `reward_${id}`);
    if (pick || g.input.button === "skip") {
      if (pick) g.data.deck.push(pick);
      g.data.reward = null;
      g.nextLevel();
      g.data.drawPile = shuffle(g, g.data.deck.slice()); g.data.discard = []; g.data.hand = [];
      newEnemy(g); startTurn(g);
    }
    return;
  }
  if (g.input.button === "end") { endTurn(g); return; }
  for (const tap of g.input.taps) {
    const rects = cardRects(g);
    const i = rects.findIndex((r) => Math.abs(tap.x - r.x) < r.w / 2 && Math.abs(tap.y - r.y) < r.h / 2);
    if (i < 0) continue;
    const card = CARDS[g.data.hand[i].id];
    if (card.cost > g.data.energy) { g.floatText(rects[i].x, rects[i].y - 70, "NO ENERGY", "danger", 14); continue; }
    g.data.energy -= card.cost;
    const [played] = g.data.hand.splice(i, 1);
    g.data.discard.push(played.id);
    card.play(g);
    g.sfx("pop");
    if (e.hp <= 0) {
      g.addScore(100 * g.level, g.W / 2, g.H * 0.2);
      g.burst(g.W / 2, g.H * 0.25, { color: ["primary", "good"], count: 40, speed: 280 });
      g.sfx("win");
      g.data.reward = shuffle(g, REWARDS.slice()).slice(0, 3);
      return;
    }
  }
});

function drawCard(ctx, g, id, r, dim) {
  const c = CARDS[id];
  ctx.save(); ctx.globalAlpha = dim ? 0.55 : 1;
  g.panel(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h, { r: 10, fill: g.shade(g.color(c.color), -0.55), stroke: g.color(c.color), lineWidth: 2.5 });
  if (!g.sprite(`card_${id}`, r.x, r.y - 14, r.w * 0.7, r.h * 0.38)) {
    ctx.fillStyle = g.color(c.color); ctx.globalAlpha *= 0.85;
    ctx.beginPath(); ctx.arc(r.x, r.y - 14, Math.min(r.w, r.h) * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = dim ? 0.55 : 1;
  }
  g.text(c.name, r.x, r.y - r.h / 2 + 14, { size: 12, align: "center", baseline: "middle", shadow: false });
  g.wrapText(c.text, r.x, r.y + 22, r.w - 10, { size: 10, align: "center", stroke: false, maxLines: 3 });
  ctx.fillStyle = g.pal.primary; ctx.beginPath(); ctx.arc(r.x - r.w / 2 + 4, r.y - r.h / 2 + 4, 11, 0, Math.PI * 2); ctx.fill();
  g.text(String(c.cost), r.x - r.w / 2 + 4, r.y - r.h / 2 + 5, { size: 13, align: "center", baseline: "middle", color: "#1b1733", stroke: false, shadow: false });
  ctx.restore();
}

g.draw((ctx, g) => {
  const e = g.data.enemy, ex = g.W / 2 + (e.shake > 0 ? Math.sin(g.time * 80) * 6 : 0), ey = g.H * 0.27;
  if (!g.sprite("enemy", ex, ey, 150, 150)) {
    ctx.fillStyle = g.pal.danger; ctx.beginPath(); ctx.arc(ex, ey, 58, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(14,10,32,0.9)"; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex - 18, ey - 10, 10, 0, Math.PI * 2); ctx.arc(ex + 18, ey - 10, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1b1733"; ctx.beginPath(); ctx.arc(ex - 16, ey - 8, 5, 0, Math.PI * 2); ctx.arc(ex + 20, ey - 8, 5, 0, Math.PI * 2); ctx.fill();
  }
  // Enemy HP + intent
  const bw = 180;
  g.panel(g.W / 2 - bw / 2, ey + 82, bw, 16, { r: 8 });
  ctx.fillStyle = g.pal.danger; ctx.fillRect(g.W / 2 - bw / 2 + 2, ey + 84, (bw - 4) * Math.max(0, e.hp / e.maxHp), 12);
  g.text(`${Math.max(0, e.hp)}/${e.maxHp}${e.block ? `  🛡${e.block}` : ""}`, g.W / 2, ey + 91, { size: 11, align: "center", baseline: "middle", stroke: false });
  const it = e.intent;
  const label = it.kind === "block" ? `Will BLOCK ${it.value}` : `Will ATTACK ${it.value}${it.hits ? ` x${it.hits}` : ""}`;
  g.panel(g.W / 2 - 80, ey - 108, 160, 28, { r: 14, fill: it.kind === "block" ? "rgba(56,214,255,0.25)" : "rgba(255,90,79,0.3)" });
  g.text(label, g.W / 2, ey - 93, { size: 13, align: "center", baseline: "middle", stroke: false });
  // Player stats
  const py = g.H - 230;
  g.panel(14, py, 150, 34, { r: 12 });
  g.text(`HP ${g.data.hp}/${TUNING.hp}${g.data.block ? `   BLOCK ${g.data.block}` : ""}`, 24, py + 18, { size: 13, baseline: "middle", stroke: false });
  g.panel(g.W - 110, py, 96, 34, { r: 12, fill: "rgba(255,207,63,0.25)" });
  g.text(`⚡ ${g.data.energy}/${TUNING.energy}`, g.W - 62, py + 18, { size: 15, align: "center", baseline: "middle", stroke: false });
  cardRects(g).forEach((r, i) => {
    const c = g.data.hand[i];
    const lift = c.pop > 0 ? Math.sin((c.pop / 0.25) * Math.PI) * 14 : 0;
    drawCard(ctx, g, c.id, { ...r, y: r.y - lift }, CARDS[c.id].cost > g.data.energy);
  });
  g.text(`Deck ${g.data.drawPile.length}  ·  Discard ${g.data.discard.length}`, 16, g.H - 22, { size: 11, stroke: false, color: "rgba(255,255,255,0.7)" });
  if (!g.data.reward) g.button("end", { x: g.W - 80, y: g.H - 30, w: 130, h: 42, label: "END TURN", color: "accent", size: 15 });
  else {
    g.panel(20, g.H * 0.2, g.W - 40, 340, { r: 22, fill: "rgba(14,10,36,0.92)" });
    g.text("CHOOSE A CARD", g.W / 2, g.H * 0.2 + 34, { font: "display", size: 24, align: "center", baseline: "middle", gradient: ["#ffffff", g.pal.primary] });
    g.data.reward.forEach((id, i) => g.button(`reward_${id}`, { x: g.W / 2, y: g.H * 0.2 + 100 + i * 66, w: g.W - 90, h: 54, label: `${CARDS[id].name} — ${CARDS[id].text}`, color: CARDS[id].color, size: 15, font: "ui" }));
    g.button("skip", { x: g.W / 2, y: g.H * 0.2 + 300, w: 120, h: 36, label: "SKIP", variant: "glass", size: 14, font: "ui" });
  }
});
