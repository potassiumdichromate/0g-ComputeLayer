// Recipe: cricket — the bowler delivers down the pitch; tap to swing when the
// ball reaches the bat. Timing decides SIX / FOUR / runs; miss a straight
// ball and you're out. Six balls per over, ball speed rises each over.
const TUNING = { speed: 300, speedPerOver: 28, perfect: 14, good: 30, ok: 48, ballsPerOver: 6 };

const g = KULT.game({
  title: "Super Over",
  hint: "Tap (or Space) to swing as the ball reaches your bat. Perfect timing = SIX!",
  lives: 3,
  background: { deco: "none" },
  hud: { level: true }
});

function pitch(g) {
  return { x: g.W / 2, top: g.H * 0.16, bottom: g.H * 0.86, hitY: g.H * 0.78, stumpsY: g.H * 0.84, bounceY: g.H * 0.6 };
}

function nextBall(g) {
  const P = pitch(g);
  g.data.ball = null;
  g.data.swing = 0;
  g.data.phase = "runup";
  g.data.bowlerY = P.top - 40;
  g.after(0.9, () => {
    if (g.state !== "play") return;
    const straight = g.chance(0.6);
    const line = straight ? g.range(-8, 8) : g.pick([-1, 1]) * g.range(28, 60);
    g.data.ball = { x: P.x + g.range(-10, 10), y: P.top + 30, tx: P.x + line, straight, speed: TUNING.speed + (g.level - 1) * TUNING.speedPerOver + g.range(-20, 30), bounced: false, z: 0, vz: 0, hit: null };
    g.data.phase = "delivery";
    g.sfx("shoot");
  });
}

function swing(g) {
  if (g.data.swing > 0) return;
  g.data.swing = 0.3;
  g.sfx("flap");
  const b = g.data.ball, P = pitch(g);
  if (!b || b.hit || g.data.phase !== "delivery") return;
  const off = Math.abs(b.y - P.hitY);
  if (off > TUNING.ok) return; // swung and missed: the ball keeps coming
  const runs = off < TUNING.perfect ? 6 : off < TUNING.good ? 4 : g.pick([1, 2, 2, 3]);
  const early = b.y < P.hitY;
  b.hit = { runs, vx: (early ? -1 : 1) * g.range(120, 260) * (runs >= 4 ? 1.6 : 1), vy: -(runs === 6 ? 900 : runs === 4 ? 700 : 420), vz: runs === 6 ? 520 : 160 };
  g.data.phase = "hit";
  g.data.ballsLeft -= 1;
  g.addScore(runs * 10, b.x, b.y - 30, { combo: runs >= 4 });
  g.floatText(g.W / 2, g.H * 0.45, runs === 6 ? "SIX!" : runs === 4 ? "FOUR!" : `${runs} RUN${runs > 1 ? "S" : ""}`, runs >= 4 ? "primary" : "text", runs >= 4 ? 44 : 26);
  g.sfx(runs >= 4 ? "win" : "coin");
  if (runs === 6) { g.shake(6, 0.25); g.flash("primary", 0.2); g.burst(b.x, b.y, { color: ["primary", "good"], count: 30, speed: 300 }); }
  g.after(1.3, () => endBall(g));
}

function endBall(g) {
  if (g.state !== "play") return;
  if (g.data.ballsLeft <= 0) { g.nextLevel(); g.data.ballsLeft = TUNING.ballsPerOver; }
  nextBall(g);
}

g.setup((g) => {
  g.data.ballsLeft = TUNING.ballsPerOver;
  g.data.trail = [];
  nextBall(g);
});

g.update((g, dt) => {
  const P = pitch(g), b = g.data.ball;
  g.hud.set("Balls", g.data.ballsLeft);
  g.data.swing = Math.max(0, g.data.swing - dt);
  if (g.data.phase === "runup") g.data.bowlerY = g.lerp(g.data.bowlerY, P.top + 10, Math.min(1, dt * 3));
  if (g.input.pressed || g.input.action) swing(g);
  if (!b) return;
  if (b.hit) {
    b.x += b.hit.vx * dt; b.y += b.hit.vy * dt;
    b.hit.vz -= 900 * dt; b.z = Math.max(0, b.z + b.hit.vz * dt);
    g.data.trail.push({ x: b.x, y: b.y - b.z, t: 0.3 });
  } else {
    b.y += b.speed * dt;
    b.x = g.lerp(b.x, b.tx, Math.min(1, dt * 2));
    // Bounce on the pitch, then the ball rises slightly toward the batter.
    if (!b.bounced) { b.z = Math.max(0, (P.bounceY - b.y) * 0.25); if (b.y >= P.bounceY) { b.bounced = true; b.vz = 140; g.sfx("bounce"); } }
    else { b.vz -= 600 * dt; b.z = Math.max(0, b.z + b.vz * dt); }
    if (b.y > P.stumpsY && g.data.phase === "delivery") {
      g.data.phase = "dead";
      g.data.ballsLeft -= 1;
      if (b.straight) {
        g.floatText(g.W / 2, g.H * 0.45, "BOWLED!", "danger", 40);
        g.burst(P.x, P.stumpsY, { color: "#f5deb3", count: 16 });
        g.loseLife({ title: "ALL OUT" });
      } else {
        g.floatText(g.W / 2, g.H * 0.45, "DOT BALL", "text", 22);
      }
      g.after(1, () => endBall(g));
    }
  }
  for (const t of g.data.trail) t.t -= dt;
  g.data.trail = g.data.trail.filter((t) => t.t > 0);
});

g.drawBehind((ctx, g) => {
  const P = pitch(g);
  ctx.fillStyle = "#2e8b3a"; ctx.fillRect(0, 0, g.W, g.H);
  for (let i = 0; i < 12; i += 1) { ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"; ctx.fillRect(0, i * g.H / 12, g.W, g.H / 12); }
  // Pitch in perspective: narrow at the bowler's end.
  ctx.fillStyle = "#c9a66b";
  ctx.beginPath(); ctx.moveTo(P.x - 34, P.top); ctx.lineTo(P.x + 34, P.top); ctx.lineTo(P.x + 62, P.bottom); ctx.lineTo(P.x - 62, P.bottom); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(P.x - 70, P.hitY + 10); ctx.lineTo(P.x + 70, P.hitY + 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(P.x - 40, P.top + 40); ctx.lineTo(P.x + 40, P.top + 40); ctx.stroke();
  for (const dx of [-9, 0, 9]) { ctx.fillStyle = "#f5deb3"; ctx.fillRect(P.x + dx - 2, P.stumpsY - 26, 4, 28); ctx.fillRect(P.x + dx * 0.6 - 2, P.top + 14, 3, 18); }
});

g.draw((ctx, g) => {
  const P = pitch(g), b = g.data.ball;
  if (!g.sprite("bowler", P.x, g.data.bowlerY, 54, 54)) {
    ctx.fillStyle = g.pal.secondary; ctx.beginPath(); ctx.arc(P.x, g.data.bowlerY, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(14,10,32,0.85)"; ctx.lineWidth = 2; ctx.stroke();
  }
  for (const t of g.data.trail) { ctx.globalAlpha = t.t / 0.3 * 0.6; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (b) {
    const s = 0.6 + (b.y / g.H) * 0.6;
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(b.x, b.y, 7 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#d1202f"; ctx.beginPath(); ctx.arc(b.x, b.y - b.z, 7 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x, b.y - b.z, 7 * s, -0.6, 0.6); ctx.stroke();
  }
  // Batter at the crease; the bat swings through an arc on tap.
  const sw = g.data.swing > 0 ? 1 - g.data.swing / 0.3 : 0;
  const bx = P.x + 26, by = P.hitY + 22;
  if (!g.sprite("batter", bx + 14, by - 20, 80, 80)) {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(bx - 4, by - 40, 22, 40);
    ctx.fillStyle = "#f2c9a0"; ctx.beginPath(); ctx.arc(bx + 7, by - 50, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g.pal.accent; ctx.fillRect(bx - 5, by - 64, 24, 8);
  }
  ctx.save(); ctx.translate(bx, by - 26); ctx.rotate(-0.4 - sw * 2.4);
  ctx.fillStyle = "#e8c48a"; ctx.fillRect(-5, 0, 10, 46); ctx.strokeStyle = "rgba(14,10,32,0.85)"; ctx.lineWidth = 2; ctx.strokeRect(-5, 0, 10, 46);
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.setLineDash([4, 6]);
  ctx.beginPath(); ctx.moveTo(P.x - 60, P.hitY); ctx.lineTo(P.x + 60, P.hitY); ctx.stroke(); ctx.setLineDash([]);
});
