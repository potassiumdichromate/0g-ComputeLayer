// Recipe: idle — clicker / incremental: tap the big object to earn coins, buy
// upgrades that boost taps and add automatic income, costs grow each purchase,
// milestones level you up. Never ends; the score is lifetime earnings.
const UPGRADES = [
  { id: "tap", name: "Stronger Tap", base: 15, growth: 1.5, desc: "+1 per tap", apply: (d) => { d.perTap += 1; } },
  { id: "helper", name: "Helper", base: 40, growth: 1.18, desc: "+1 per second", apply: (d) => { d.perSec += 1; } },
  { id: "factory", name: "Factory", base: 400, growth: 1.2, desc: "+10 per second", apply: (d) => { d.perSec += 10; } },
  { id: "boost", name: "Golden Boost", base: 2500, growth: 2.2, desc: "x2 all income", apply: (d) => { d.mult *= 2; } }
];
const MILESTONES = [100, 1000, 10000, 100000, 1000000, 10000000];

const g = KULT.game({
  title: "Coin Tycoon",
  hint: "Tap the big coin to earn. Buy upgrades to earn faster — even while you wait!",
  lives: 0,
  background: { deco: "bubbles" },
  hud: false
});

function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}
const cost = (g, u) => Math.round(u.base * Math.pow(u.growth, g.data.owned[u.id]));

function earn(g, amount, x, y) {
  g.data.coins += amount;
  g.data.total += amount;
  g.score = Math.floor(g.data.total);
  if (x != null) g.floatText(x + g.range(-20, 20), y, `+${fmt(amount)}`, "primary", 22);
  while (g.data.milestone < MILESTONES.length && g.data.total >= MILESTONES[g.data.milestone]) {
    g.data.milestone += 1;
    g.nextLevel();
  }
}

g.setup((g) => {
  g.data.coins = 0;
  g.data.total = 0;
  g.data.perTap = 1;
  g.data.perSec = 0;
  g.data.mult = 1;
  g.data.owned = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
  g.data.milestone = 0;
  g.data.squash = 0;
  g.data.acc = 0;
});

g.update((g, dt) => {
  const cx = g.W / 2, cy = g.H * 0.36;
  g.data.squash = Math.max(0, g.data.squash - dt * 4);
  g.data.acc += g.data.perSec * g.data.mult * dt;
  if (g.data.acc >= 1) { const whole = Math.floor(g.data.acc); g.data.acc -= whole; earn(g, whole); }
  const buy = UPGRADES.find((u) => g.input.button === u.id);
  if (buy) {
    const c = cost(g, buy);
    if (g.data.coins >= c) { g.data.coins -= c; g.data.owned[buy.id] += 1; buy.apply(g.data); g.sfx("power"); g.burst(g.W / 2, g.H * 0.62, { color: "good", count: 12 }); }
    return;
  }
  const tapped = g.input.pressed && Math.hypot(g.input.x - cx, g.input.y - cy) < 90;
  if (tapped || g.input.action) {
    earn(g, g.data.perTap * g.data.mult, cx, cy - 80);
    g.data.squash = 1;
    g.burst(cx, cy, { color: ["primary", "#ffe28a"], count: 6, speed: 180 });
    g.sfx("coin");
  }
});

g.draw((ctx, g) => {
  const cx = g.W / 2, cy = g.H * 0.36;
  g.text(fmt(g.data.coins), cx, 62, { font: "display", size: 44, align: "center", baseline: "middle", gradient: ["#ffffff", g.pal.primary] });
  g.text(`${fmt(g.data.perSec * g.data.mult)} / sec  ·  ${fmt(g.data.perTap * g.data.mult)} / tap`, cx, 96, { size: 13, align: "center", baseline: "middle", stroke: false, color: "rgba(255,255,255,0.8)" });
  const s = 1 + g.data.squash * 0.12 + Math.sin(g.time * 3) * 0.02;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, 2 - s);
  const glow = ctx.createRadialGradient(0, 0, 20, 0, 0, 130);
  glow.addColorStop(0, "rgba(255,220,120,0.45)"); glow.addColorStop(1, "rgba(255,220,120,0)");
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 130, 0, Math.PI * 2); ctx.fill();
  if (!g.sprite("clicker", 0, 0, 170, 170)) {
    ctx.fillStyle = "#f5b72a"; ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#a8670a"; ctx.lineWidth = 8; ctx.stroke();
    ctx.fillStyle = "#ffd75e"; ctx.beginPath(); ctx.arc(0, 0, 58, 0, Math.PI * 2); ctx.fill();
    g.text("$", 0, 4, { font: "display", size: 64, align: "center", baseline: "middle", color: "#a8670a", stroke: false, shadow: false });
  }
  ctx.restore();
  const top = g.H * 0.58;
  UPGRADES.forEach((u, i) => {
    const y = top + i * 62, c = cost(g, u), can = g.data.coins >= c;
    g.panel(16, y - 26, g.W - 32, 54, { r: 14, fill: can ? "rgba(93,255,143,0.12)" : "rgba(12,9,32,0.5)" });
    g.sprite(`upgrade_${u.id}`, 44, y + 1, 38, 38);
    g.text(`${u.name}  ×${g.data.owned[u.id]}`, 70, y - 6, { size: 15, baseline: "middle", stroke: false });
    g.text(u.desc, 70, y + 13, { size: 11, baseline: "middle", stroke: false, color: "rgba(255,255,255,0.7)" });
    g.button(u.id, { x: g.W - 74, y, w: 100, h: 40, label: fmt(c), color: can ? "good" : "secondary", size: 15, disabled: !can });
  });
  g.text(`LIFETIME ${fmt(g.data.total)}  ·  LV ${g.level}`, cx, g.H - 18, { size: 11, align: "center", stroke: false, color: "rgba(255,255,255,0.6)" });
});
