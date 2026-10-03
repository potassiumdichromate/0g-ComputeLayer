// Recipe: penalty — swipe from the ball toward the goal to shoot; beat the
// keeper; corners score more; keeper gets sharper each level.
const TUNING = { flight: 0.62, keeperSpeed: 70, reaction: 0.28, reach: 54, goalW: 270, goalH: 112, shotsPerLevel: 5, goalsToAdvance: 3 };

const g = KULT.game({
  title: "Penalty King",
  hint: "Swipe up from the ball toward the goal. Aim for the corners!",
  lives: 3,
  background: { deco: "none" },
  hud: { level: true }
});

function goalBox(g) {
  const w = TUNING.goalW, h = TUNING.goalH, x = (g.W - w) / 2, y = g.H * 0.2;
  return { x, y, w, h, cx: g.W / 2, bottom: y + h };
}

function resetShot(g) {
  const G = goalBox(g);
  g.data.ball = { x: g.W / 2, y: g.H * 0.8, sx: g.W / 2, sy: g.H * 0.8, tx: 0, ty: 0, t: 0, flying: false, scale: 1, curve: 0 };
  g.data.keeper = { x: G.cx, y: G.bottom - 34, base: G.cx, dive: 0, diveX: G.cx, state: "idle", t: 0 };
  g.data.result = null;
  g.data.aimX = G.cx;
}

function shoot(g, tx, ty, curve) {
  const b = g.data.ball;
  if (b.flying || g.data.result) return;
  Object.assign(b, { flying: true, t: 0, tx, ty, curve: curve || 0 });
  g.sfx("shoot");
  // The keeper guesses after a short reaction time, with some error.
  const k = g.data.keeper, skill = Math.min(0.85, 0.35 + g.level * 0.1);
  const guess = g.chance(skill) ? tx : goalBox(g).cx + g.range(-1, 1) * TUNING.goalW * 0.45;
  g.after(Math.max(0.12, TUNING.reaction - g.level * 0.03), () => { k.state = "dive"; k.diveX = guess; k.t = 0; });
}

function resolve(g) {
  const b = g.data.ball, k = g.data.keeper, G = goalBox(g);
  const inGoal = b.tx > G.x + 6 && b.tx < G.x + G.w - 6 && b.ty > G.y + 6 && b.ty < G.bottom;
  const saved = inGoal && Math.abs(k.x - b.tx) < TUNING.reach && b.ty > k.y - 60;
  g.data.shots += 1;
  if (!inGoal) {
    g.data.result = "MISS";
    g.loseLife({ title: "OUT OF CHANCES" });
  } else if (saved) {
    g.data.result = "SAVED!";
    g.sfx("hit"); g.shake(5, 0.2);
    g.loseLife({ title: "THE KEEPER WINS" });
  } else {
    const corner = Math.abs(b.tx - G.cx) > G.w * 0.32;
    const top = b.ty < G.y + G.h * 0.4;
    const pts = 100 + (corner ? 100 : 0) + (top ? 50 : 0);
    g.data.result = corner && top ? "TOP BINS!" : corner ? "CORNER!" : "GOAL!";
    g.data.goals += 1;
    g.data.netWave = 1;
    g.addScore(pts, b.tx, b.ty, { combo: true });
    g.burst(b.tx, b.ty, { color: ["primary", "good", "secondary"], count: 30, speed: 260 });
    g.sfx("win"); g.flash("good", 0.18);
  }
  if (g.state !== "play") return;
  if (g.data.shots >= TUNING.shotsPerLevel) {
    if (g.data.goals >= TUNING.goalsToAdvance) g.after(0.9, () => { g.nextLevel(); g.data.shots = 0; g.data.goals = 0; });
    else g.after(0.9, () => g.over({ title: "KNOCKED OUT" }));
  }
  g.after(1.1, () => resetShot(g));
}

g.setup((g) => {
  g.data.shots = 0;
  g.data.goals = 0;
  g.data.netWave = 0;
  resetShot(g);
});

g.update((g, dt) => {
  const b = g.data.ball, k = g.data.keeper, G = goalBox(g);
  g.hud.set("Shot", `${Math.min(TUNING.shotsPerLevel, g.data.shots + 1)}/${TUNING.shotsPerLevel}`);
  g.hud.set("Goals", `${g.data.goals}/${TUNING.goalsToAdvance}`);
  g.data.netWave = Math.max(0, g.data.netWave - dt * 1.5);

  // Keeper: sways on the line, then dives toward the guess.
  k.t += dt;
  if (k.state === "idle") k.x = k.base + Math.sin(g.time * (1.4 + g.level * 0.2)) * (TUNING.goalW * 0.22);
  else { k.x = g.lerp(k.x, k.diveX, Math.min(1, dt * (5 + g.level))); k.dive = Math.min(1, k.t * 4) * Math.sign(k.diveX - k.base); }

  if (b.flying) {
    b.t += dt / TUNING.flight;
    const t = Math.min(1, b.t), e = 1 - Math.pow(1 - t, 2);
    b.x = b.sx + (b.tx - b.sx) * e + Math.sin(t * Math.PI) * b.curve;
    b.y = b.sy + (b.ty - b.sy) * e - Math.sin(t * Math.PI) * 40;
    b.scale = 1 - 0.45 * e;
    if (t >= 1) { b.flying = false; resolve(g); }
    return;
  }
  if (g.data.result) return;

  // Touch: swipe from anywhere; length and angle pick the target.
  if (g.input.released && g.input.startY - g.input.y > 40) {
    const dx = g.input.x - g.input.startX, dy = g.input.y - g.input.startY;
    const tx = b.x + dx * 1.35, ty = Math.max(G.y - 40, b.y + dy * 1.25);
    shoot(g, tx, ty, g.clamp(dx * 0.15, -40, 40));
  }
  // Keyboard: arrows aim, space shoots high to the aimed side.
  const ax = g.input.axis().x;
  if (ax) g.data.aimX = g.clamp(g.data.aimX + ax * 220 * dt, G.x - 20, G.x + G.w + 20);
  if (g.input.action || g.input.swipe === "up") shoot(g, g.data.aimX, G.y + G.h * 0.3, 0);
});

g.drawBehind((ctx, g) => {
  const G = goalBox(g);
  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = i % 2 ? "#2f8f3a" : "#38a043";
    ctx.fillRect(0, G.bottom - 30 + i * 60, g.W, 60);
  }
  ctx.fillStyle = "#26722f"; ctx.fillRect(0, 0, g.W, G.bottom - 30);
  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 3;
  ctx.strokeRect(G.x - 40, G.bottom, G.w + 80, 70);
  ctx.beginPath(); ctx.arc(g.W / 2, g.H * 0.8, 4, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
  // Net with a ripple after a goal.
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
  for (let x = G.x; x <= G.x + G.w; x += 14) { ctx.beginPath(); ctx.moveTo(x, G.y); ctx.lineTo(x + Math.sin(g.time * 20 + x) * 4 * g.data.netWave, G.bottom); ctx.stroke(); }
  for (let y = G.y; y <= G.bottom; y += 14) { ctx.beginPath(); ctx.moveTo(G.x, y); ctx.lineTo(G.x + G.w, y); ctx.stroke(); }
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(G.x, G.bottom); ctx.lineTo(G.x, G.y); ctx.lineTo(G.x + G.w, G.y); ctx.lineTo(G.x + G.w, G.bottom); ctx.stroke();
});

g.draw((ctx, g) => {
  const k = g.data.keeper, b = g.data.ball, G = goalBox(g);
  ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.dive * 0.9);
  if (!g.sprite("keeper", 0, 0, 70, 70)) {
    ctx.fillStyle = g.pal.accent; ctx.fillRect(-16, -26, 32, 46);
    ctx.fillStyle = "#f2c9a0"; ctx.beginPath(); ctx.arc(0, -36, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g.pal.primary; ctx.fillRect(-34, -24, 18, 10); ctx.fillRect(16, -24, 18, 10);
    ctx.strokeStyle = "rgba(14,10,32,0.85)"; ctx.lineWidth = 2; ctx.strokeRect(-16, -26, 32, 46);
  }
  ctx.restore();
  if (!b.flying && !g.data.result) {
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(g.data.aimX, G.y + G.h * 0.3); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(b.x, b.y + 16 * b.scale, 14 * b.scale, 5 * b.scale, 0, 0, Math.PI * 2); ctx.fill();
  if (!g.sprite("ball", b.x, b.y, 32 * b.scale, 32 * b.scale, { rot: b.t * 12 })) {
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(b.x, b.y, 15 * b.scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1b1733"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#1b1733"; ctx.beginPath(); ctx.arc(b.x, b.y, 5 * b.scale, 0, Math.PI * 2); ctx.fill();
  }
  if (g.data.result) g.text(g.data.result, g.W / 2, g.H * 0.55, { font: "display", size: 40, align: "center", baseline: "middle", gradient: ["#ffffff", g.data.result.includes("SAVE") || g.data.result === "MISS" ? g.pal.danger : g.pal.primary] });
});
