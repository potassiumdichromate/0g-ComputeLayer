// Recipe: pinball — two flippers (tap left/right half, or arrows), bumpers
// that kick, top lanes that light up for a multiplier, a drain between the
// flippers. Circle-vs-segment physics with substeps.
const TUNING = { gravity: 900, restitution: 0.55, bumperKick: 520, flipSpeed: 18, maxSpeed: 1150, substeps: 6, ballR: 10 };

const g = KULT.game({
  title: "Neon Pinball",
  hint: "Tap the left or right half (or arrows) to flip. Keep the ball alive!",
  lives: 3,
  background: { deco: "grid" },
  hud: { level: true }
});

function table(g) {
  const W = g.W, H = g.H, fy = H - 110;
  const walls = [
    [12, 90, 12, fy - 60], [W - 12, 90, W - 12, fy - 60], [12, 90, W * 0.3, 40], [W * 0.7, 40, W - 12, 90], [W * 0.3, 40, W * 0.7, 40],
    [12, fy - 60, W * 0.5 - 70, fy + 20], [W - 12, fy - 60, W * 0.5 + 70, fy + 20],
    [W * 0.22, fy - 150, W * 0.3, fy - 70], [W * 0.78, fy - 150, W * 0.7, fy - 70]
  ];
  const bumpers = [{ x: W * 0.32, y: H * 0.3, r: 26 }, { x: W * 0.68, y: H * 0.3, r: 26 }, { x: W * 0.5, y: H * 0.42, r: 30 }];
  const lanes = [W * 0.38, W * 0.5, W * 0.62].map((x) => ({ x, y: 72 }));
  const flippers = [
    { px: W * 0.5 - 70, py: fy + 20, len: 62, side: -1 },
    { px: W * 0.5 + 70, py: fy + 20, len: 62, side: 1 }
  ];
  return { walls, bumpers, lanes, flippers, drainY: H + 20 };
}

function flipperSeg(f, angle) {
  return [f.px, f.py, f.px - f.side * Math.cos(angle) * f.len, f.py + Math.sin(angle) * f.len];
}

function collideSegment(b, x1, y1, x2, y2, bounce, surfaceVel) {
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((b.x - x1) * dx + (b.y - y1) * dy) / len2));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  const ox = b.x - cx, oy = b.y - cy, d = Math.hypot(ox, oy) || 0.001;
  if (d >= TUNING.ballR) return false;
  const nx = ox / d, ny = oy / d;
  b.x = cx + nx * TUNING.ballR; b.y = cy + ny * TUNING.ballR;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + bounce) * vn * nx; b.vy -= (1 + bounce) * vn * ny; }
  if (surfaceVel) { b.vx += nx * surfaceVel * t; b.vy += ny * surfaceVel * t; }
  return true;
}

function newBall(g) {
  g.data.ball = { x: g.W * 0.5 + g.range(-40, 40), y: 110, vx: g.range(-60, 60), vy: 0, trail: [] };
}

g.setup((g) => {
  g.data.t = table(g);
  g.data.angles = [-0.45, -0.45];
  g.data.lit = [false, false, false];
  g.data.mult = 1;
  g.data.bumperFx = [0, 0, 0];
  newBall(g);
});

g.update((g, dt) => {
  const T = g.data.t, b = g.data.ball;
  const leftHeld = (g.input.down && g.input.x < g.W / 2) || g.input.key("ArrowLeft") || g.input.key("KeyA");
  const rightHeld = (g.input.down && g.input.x >= g.W / 2) || g.input.key("ArrowRight") || g.input.key("KeyD");
  const target = [leftHeld ? 0.5 : -0.45, rightHeld ? 0.5 : -0.45];
  const prev = g.data.angles.slice();
  if ((leftHeld && prev[0] < 0) || (rightHeld && prev[1] < 0)) g.sfx("click");
  const step = dt / TUNING.substeps;
  for (let s = 0; s < TUNING.substeps; s += 1) {
    for (let i = 0; i < 2; i += 1) g.data.angles[i] = g.data.angles[i] + g.clamp(target[i] - g.data.angles[i], -TUNING.flipSpeed * step, TUNING.flipSpeed * step);
    b.vy += TUNING.gravity * step;
    b.x += b.vx * step; b.y += b.vy * step;
    for (const w of T.walls) collideSegment(b, ...w, TUNING.restitution, 0);
    T.flippers.forEach((f, i) => {
      const angVel = (g.data.angles[i] - prev[i]) / dt;
      collideSegment(b, ...flipperSeg(f, g.data.angles[i]), 0.3, angVel > 0 ? angVel * f.len * 0.55 : 0);
    });
    T.bumpers.forEach((bp, i) => {
      const dx = b.x - bp.x, dy = b.y - bp.y, d = Math.hypot(dx, dy);
      if (d < bp.r + TUNING.ballR) {
        const nx = dx / d, ny = dy / d;
        b.x = bp.x + nx * (bp.r + TUNING.ballR); b.y = bp.y + ny * (bp.r + TUNING.ballR);
        b.vx = nx * TUNING.bumperKick; b.vy = ny * TUNING.bumperKick;
        g.data.bumperFx[i] = 0.2;
        g.addScore(25 * g.data.mult, bp.x, bp.y - bp.r - 10);
        g.sfx("bounce"); g.shake(2, 0.08);
      }
    });
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > TUNING.maxSpeed) { b.vx *= TUNING.maxSpeed / sp; b.vy *= TUNING.maxSpeed / sp; }
  }
  T.lanes.forEach((ln, i) => {
    if (!g.data.lit[i] && Math.abs(b.x - ln.x) < 14 && Math.abs(b.y - ln.y) < 18) {
      g.data.lit[i] = true; g.addScore(50, ln.x, ln.y + 20); g.sfx("coin");
      if (g.data.lit.every(Boolean)) { g.data.mult += 1; g.data.lit = [false, false, false]; g.nextLevel(); g.floatText(g.W / 2, g.H * 0.2, `x${g.data.mult} MULTIPLIER`, "primary", 26); }
    }
  });
  g.data.bumperFx = g.data.bumperFx.map((v) => Math.max(0, v - dt));
  b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 10) b.trail.shift();
  g.hud.set("Mult", `x${g.data.mult}`);
  if (b.y > T.drainY) {
    g.sfx("lose");
    if (g.loseLife({ title: "DRAINED" }) > 0) newBall(g);
  }
});

g.draw((ctx, g) => {
  const T = g.data.t, b = g.data.ball;
  ctx.lineCap = "round";
  ctx.strokeStyle = g.pal.secondary; ctx.lineWidth = 6; ctx.shadowColor = g.pal.secondary; ctx.shadowBlur = 10;
  for (const w of T.walls) { ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]); ctx.stroke(); }
  ctx.shadowBlur = 0;
  T.lanes.forEach((ln, i) => { ctx.fillStyle = g.data.lit[i] ? g.pal.primary : "rgba(255,255,255,0.2)"; ctx.beginPath(); ctx.arc(ln.x, ln.y, 8, 0, Math.PI * 2); ctx.fill(); });
  T.bumpers.forEach((bp, i) => {
    const s = 1 + g.data.bumperFx[i] * 1.2;
    if (!g.sprite("bumper", bp.x, bp.y, bp.r * 2.2 * s, bp.r * 2.2 * s)) {
      ctx.fillStyle = g.data.bumperFx[i] > 0 ? "#ffffff" : g.pal.accent;
      ctx.beginPath(); ctx.arc(bp.x, bp.y, bp.r * s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = g.pal.primary; ctx.lineWidth = 4; ctx.stroke();
    }
  });
  T.flippers.forEach((f, i) => {
    const [x1, y1, x2, y2] = flipperSeg(f, g.data.angles[i]);
    ctx.strokeStyle = g.pal.primary; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
  b.trail.forEach((t, i) => { ctx.globalAlpha = i / b.trail.length * 0.4; ctx.fillStyle = g.pal.secondary; ctx.beginPath(); ctx.arc(t.x, t.y, TUNING.ballR * 0.8, 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1;
  if (!g.sprite("ball", b.x, b.y, TUNING.ballR * 2.4, TUNING.ballR * 2.4)) {
    ctx.fillStyle = "#e8e8f0"; ctx.beginPath(); ctx.arc(b.x, b.y, TUNING.ballR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(b.x - 3, b.y - 3, 3, 0, Math.PI * 2); ctx.fill();
  }
});
