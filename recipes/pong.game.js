// Recipe: pong — drag your paddle along the bottom, return the ball past the
// computer's paddle at the top. The ball speeds up every hit and the angle
// depends on where it meets the paddle. Your point scores; a missed ball costs
// a life. Every 5 points is a level: the computer gets quicker.
const TUNING = { ballSpeed: 300, speedUp: 1.05, maxSpeed: 760, paddleW: 84, aiSpeed: [210, 270, 330, 400, 470], aiError: 0.32, pointsPerLevel: 5, point: 100 };

const g = KULT.game({
  hero: false,
  title: "Paddle Duel",
  hint: "Drag to move your paddle. Get the ball past the computer!",
  lives: 3,
  background: { deco: "grid" },
  hud: { level: true }
});

function serve(g, towardPlayer) {
  const b = g.data.ball;
  b.x = g.W / 2; b.y = g.H / 2;
  const a = g.range(-0.5, 0.5);
  b.speed = TUNING.ballSpeed;
  b.vx = Math.sin(a) * b.speed; b.vy = Math.cos(a) * b.speed * (towardPlayer ? 1 : -1);
  b.wait = 0.8;
  b.trail = [];
}

g.setup((g) => {
  g.data.top = 92; g.data.bottom = g.H - 70;
  g.data.player = g.spawn("player", { x: g.W / 2, y: g.data.bottom, w: TUNING.paddleW, h: 16, shape: "capsule", color: "primary", moves: "drag", movesOpts: { axis: "x", lerp: 18 }, bounds: "clampX", pop: false, glow: "primary" });
  g.data.cpu = g.spawn("cpu", { x: g.W / 2, y: g.data.top, w: TUNING.paddleW, h: 16, shape: "capsule", color: "danger", pop: false, glow: "danger" });
  g.data.ball = { x: g.W / 2, y: g.H / 2, vx: 0, vy: 0, r: 9, speed: TUNING.ballSpeed, wait: 1, trail: [] };
  g.data.points = 0;
  g.data.aim = 0;
  serve(g, true);
});

function bounceOff(g, paddle, dirUp) {
  const b = g.data.ball;
  const off = Math.max(-1, Math.min(1, (b.x - paddle.x) / (paddle.w / 2)));
  b.speed = Math.min(TUNING.maxSpeed, b.speed * TUNING.speedUp);
  const ang = off * 1.0;
  b.vx = Math.sin(ang) * b.speed;
  b.vy = Math.cos(ang) * b.speed * (dirUp ? -1 : 1);
  g.burst(b.x, b.y, { color: dirUp ? "primary" : "danger", count: 8, speed: 120 });
  g.sfx("bounce");
  paddle.pop && paddle.pop();
  g.data.aim = g.range(-TUNING.aiError, TUNING.aiError) * paddle.w;
}

g.update((g, dt) => {
  const b = g.data.ball, p = g.data.player, cpu = g.data.cpu;
  p.y = g.data.bottom;
  // Computer: follows the ball (with an aiming error) when it is coming up.
  const speed = TUNING.aiSpeed[Math.min(TUNING.aiSpeed.length - 1, g.level - 1)];
  const target = b.vy < 0 ? b.x + g.data.aim : g.W / 2;
  cpu.x += Math.max(-speed * dt, Math.min(speed * dt, target - cpu.x));
  cpu.x = Math.max(cpu.w / 2, Math.min(g.W - cpu.w / 2, cpu.x));
  if (b.wait > 0) { b.wait -= dt; return; }
  b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 10) b.trail.shift();
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); g.sfx("click"); }
  if (b.x > g.W - b.r) { b.x = g.W - b.r; b.vx = -Math.abs(b.vx); g.sfx("click"); }
  if (b.vy > 0 && b.y + b.r >= p.y - p.h / 2 && b.y < p.y && Math.abs(b.x - p.x) <= p.w / 2 + b.r) { b.y = p.y - p.h / 2 - b.r; bounceOff(g, p, true); }
  if (b.vy < 0 && b.y - b.r <= cpu.y + cpu.h / 2 && b.y > cpu.y && Math.abs(b.x - cpu.x) <= cpu.w / 2 + b.r) { b.y = cpu.y + cpu.h / 2 + b.r; bounceOff(g, cpu, false); }
  if (b.y < g.data.top - 40) {
    g.data.points += 1;
    g.addScore(TUNING.point * g.level, b.x, g.data.top + 20, { combo: true });
    g.burst(b.x, g.data.top, { color: "good", count: 20, speed: 200 });
    g.sfx("coin"); g.flash("good", 0.12);
    if (g.data.points % TUNING.pointsPerLevel === 0) g.nextLevel();
    serve(g, false);
  } else if (b.y > g.data.bottom + 50) {
    g.shake(6, 0.25);
    g.loseLife();
    if (g.lives > 0) serve(g, true);
  }
  g.hud.set("Rally", Math.round((b.speed / TUNING.ballSpeed) * 10) / 10 + "x");
});

g.drawBehind((ctx, g) => {
  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 3; ctx.setLineDash([10, 12]);
  ctx.beginPath(); ctx.moveTo(10, g.H / 2); ctx.lineTo(g.W - 10, g.H / 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.arc(g.W / 2, g.H / 2, 46, 0, Math.PI * 2); ctx.stroke();
});

g.draw((ctx, g) => {
  const b = g.data.ball;
  b.trail.forEach((t, i) => { ctx.globalAlpha = (i / b.trail.length) * 0.35; ctx.fillStyle = g.color("accent"); ctx.beginPath(); ctx.arc(t.x, t.y, b.r * (i / b.trail.length), 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1;
  if (!g.sprite("ball", b.x, b.y, b.r * 2.4, b.r * 2.4)) {
    ctx.fillStyle = "#ffffff"; ctx.shadowColor = g.color("accent"); ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  if (b.wait > 0) g.text(b.wait > 0.4 ? "READY" : "GO!", g.W / 2, g.H / 2 - 40, { size: 26, color: "accent", align: "center", font: "display" });
});
