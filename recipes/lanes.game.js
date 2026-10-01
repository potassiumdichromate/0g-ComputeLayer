// Recipe: lanes — switch lanes to dodge oncoming traffic, collect coins.
const TUNING = { lanes: 3, startSpeed: 260, maxSpeed: 560, rampSeconds: 80 };

const g = KULT.game({
  title: "Lane Rush",
  hint: "Swipe or tap left/right to change lanes. Dodge everything!",
  lives: 3,
  background: { deco: "grid" },
  hud: { level: true }
});

function spawnWave(g) {
  const speed = g.data.speed;
  const lanes = [0, 1, 2];
  const blocked = g.level >= 3 && g.chance(0.35) ? 2 : 1;
  for (let i = 0; i < blocked; i += 1) {
    const lane = lanes.splice(g.randInt(0, lanes.length - 1), 1)[0];
    g.spawn("obstacle", { x: g.lane(lane, TUNING.lanes), y: -50, h: 64, w: 48, vy: speed, color: "danger", tags: ["hazard"], bounds: "none", ttl: (g.H + 200) / speed + 1, facing: "down" });
  }
  if (g.chance(0.6)) {
    const lane = g.pick(lanes);
    for (let k = 0; k < 3; k += 1) {
      g.spawn("coin", { x: g.lane(lane, TUNING.lanes), y: -50 - k * 44, r: 11, shape: "circle", color: "primary", glow: "primary", vy: speed, ttl: (g.H + 300) / speed + 1, pop: false });
    }
  }
}

g.setup((g) => {
  g.data.speed = TUNING.startSpeed;
  g.data.passed = 0;
  g.data.player = g.spawn("player", { x: g.lane(1, TUNING.lanes), y: g.H - 110, h: 72, w: 46, color: "secondary", shape: "capsule", moves: "lanes", movesOpts: { lanes: TUNING.lanes, start: 1 } });
  g.every(() => Math.max(0.45, 1.25 * (TUNING.startSpeed / g.data.speed)), () => spawnWave(g));

  g.onHit("player", "hazard", (p, h) => {
    if (p.invuln > 0) return;
    h.kill({ burst: { color: "danger", count: 20 } });
    p.invuln = 1.3;
    g.loseLife({ title: "CRASH!" });
  });
  g.onHit("player", "coin", (p, c) => {
    c.kill({ burst: { color: "primary", count: 8 } });
    g.addScore(5, c.x, c.y - 10, { combo: true });
    g.sfx("coin");
  });
});

g.update((g) => {
  g.data.speed = g.ramp(TUNING.startSpeed, TUNING.maxSpeed, TUNING.rampSeconds);
  g.bg.speedY = -g.data.speed;
  for (const h of g.all("hazard")) {
    if (!h.data.counted && h.y > g.data.player.y + 40) {
      h.data.counted = true;
      g.addScore(1);
      g.data.passed += 1;
      if (g.data.passed % 25 === 0) g.nextLevel();
    }
  }
});

g.drawBehind((ctx, g) => {
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 18]);
  ctx.lineDashOffset = -(g.time * g.data.speed) % 40;
  for (let i = 1; i < TUNING.lanes; i += 1) {
    const x = (i * g.W) / TUNING.lanes;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, g.H); ctx.stroke();
  }
  ctx.setLineDash([]);
});
