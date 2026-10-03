// Recipe: timing — sports power-meter shot (basketball): a meter sweeps; tap to
// lock the power; the ball arcs to the hoop. Sweet spot = swish, close = rim
// roll, off = miss. The hoop starts moving at higher levels.
const TUNING = { meterSpeed: 1.25, sweet: 0.06, near: 0.13, flight: 0.95, gravity: 1300 };

const g = KULT.game({
  title: "Swish Shot",
  hint: "Tap (or Space) to stop the power meter in the green zone and shoot!",
  lives: 3,
  background: { deco: "dots" },
  hud: { level: true }
});

function hoop(g) {
  const move = g.level >= 3 ? Math.sin(g.time * (0.8 + g.level * 0.15)) * g.W * 0.25 : 0;
  return { x: g.W / 2 + move, y: g.H * 0.3, r: 26 };
}

function newShot(g) {
  g.data.shooter = { x: g.range(80, g.W - 80), y: g.H * 0.78 };
  g.data.meter = 0;
  g.data.dir = 1;
  g.data.ideal = g.range(0.55, 0.8);
  g.data.ball = null;
  g.data.state = "aim";
}

function shoot(g) {
  const s = g.data.shooter, H = hoop(g);
  const err = g.data.meter - g.data.ideal;
  const T = TUNING.flight;
  // Launch velocity that would land dead center, scaled by the power error.
  const vx = (H.x - s.x) / T * (1 + err * 0.6);
  const vy = (H.y - s.y - 0.5 * TUNING.gravity * T * T) / T * (1 + err * 0.9);
  g.data.ball = { x: s.x, y: s.y - 30, vx, vy, rot: 0, scored: false, rimmed: false };
  g.data.state = "flight";
  g.data.err = Math.abs(err);
  g.sfx("flap");
}

function finish(g, made, swish) {
  g.data.state = "done";
  if (made) {
    g.data.streak += 1;
    const pts = (swish ? 3 : 2) * 10 * Math.min(5, g.data.streak);
    g.addScore(pts, hoop(g).x, hoop(g).y - 30, { combo: true });
    g.floatText(g.W / 2, g.H * 0.5, swish ? "SWISH!" : "BUCKET!", "primary", swish ? 40 : 30);
    g.sfx(swish ? "win" : "coin");
    g.burst(hoop(g).x, hoop(g).y + 20, { color: ["primary", "accent"], count: swish ? 30 : 16 });
    if (g.data.streak % 5 === 0) g.nextLevel();
  } else {
    g.data.streak = 0;
    g.floatText(g.W / 2, g.H * 0.5, "MISS", "danger", 30);
    g.loseLife({ title: "COLD HANDS" });
  }
  g.after(0.9, () => newShot(g));
}

g.setup((g) => { g.data.streak = 0; newShot(g); });

g.update((g, dt) => {
  g.hud.set("Streak", g.data.streak);
  if (g.data.state === "aim") {
    g.data.meter += g.data.dir * dt * (TUNING.meterSpeed + g.level * 0.12);
    if (g.data.meter > 1) { g.data.meter = 1; g.data.dir = -1; }
    if (g.data.meter < 0) { g.data.meter = 0; g.data.dir = 1; }
    if (g.input.pressed || g.input.action) shoot(g);
    return;
  }
  const b = g.data.ball;
  if (!b || g.data.state !== "flight") return;
  b.vy += TUNING.gravity * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.rot += dt * 8;
  const H = hoop(g);
  // Decide at the rim plane while descending.
  if (!b.scored && b.vy > 0 && b.y >= H.y) {
    b.scored = true;
    const off = Math.abs(b.x - H.x);
    if (off < H.r * 0.55 && g.data.err < TUNING.sweet) { finish(g, true, true); b.vx = 0; b.vy = 180; }
    else if (off < H.r * 1.2 && g.data.err < TUNING.near) {
      g.sfx("bounce");
      const rolls = g.chance(0.55);
      b.vy = -260; b.vx = (b.x < H.x ? -1 : 1) * (rolls ? -60 : 160);
      g.after(0.45, () => finish(g, rolls, false));
    } else finish(g, false, false);
  }
  if (b.y > g.H + 40) b.vy = 0;
});

g.draw((ctx, g) => {
  const H = hoop(g);
  // Backboard, rim and net.
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(H.x - 50, H.y - 70, 100, 62);
  ctx.strokeStyle = g.pal.danger; ctx.lineWidth = 3; ctx.strokeRect(H.x - 20, H.y - 46, 40, 32);
  ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i += 1) { ctx.beginPath(); ctx.moveTo(H.x + i * 8, H.y); ctx.lineTo(H.x + i * 5, H.y + 34); ctx.stroke(); }
  ctx.strokeStyle = "#ff6a2b"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(H.x, H.y, H.r, 7, 0, 0, Math.PI * 2); ctx.stroke();
  const s = g.data.shooter;
  if (!g.sprite("player", s.x, s.y + 6, 80, 80)) {
    ctx.fillStyle = g.pal.secondary; ctx.fillRect(s.x - 14, s.y - 20, 28, 46);
    ctx.fillStyle = "#f2c9a0"; ctx.beginPath(); ctx.arc(s.x, s.y - 30, 12, 0, Math.PI * 2); ctx.fill();
  }
  const b = g.data.ball || { x: s.x, y: s.y - 30, rot: 0 };
  if (!g.sprite("ball", b.x, b.y, 30, 30, { rot: b.rot })) {
    ctx.fillStyle = "#f08a24"; ctx.beginPath(); ctx.arc(b.x, b.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#5a2a08"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x - 14, b.y); ctx.lineTo(b.x + 14, b.y); ctx.moveTo(b.x, b.y - 14); ctx.lineTo(b.x, b.y + 14); ctx.stroke();
  }
  if (g.data.state === "aim") {
    // Power meter with the sweet zone.
    const mx = 40, my = g.H * 0.9, mw = g.W - 80, mh = 18;
    g.panel(mx - 6, my - 6, mw + 12, mh + 12, { r: 12 });
    ctx.fillStyle = "rgba(93,255,143,0.35)"; ctx.fillRect(mx + (g.data.ideal - TUNING.near) * mw, my, TUNING.near * 2 * mw, mh);
    ctx.fillStyle = g.pal.good; ctx.fillRect(mx + (g.data.ideal - TUNING.sweet) * mw, my, TUNING.sweet * 2 * mw, mh);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(mx + g.data.meter * mw - 3, my - 6, 6, mh + 12);
    g.text("POWER", g.W / 2, my - 16, { size: 12, align: "center", stroke: false, color: "rgba(255,255,255,0.8)" });
  }
});
