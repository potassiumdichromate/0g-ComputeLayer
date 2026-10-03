// Recipe: racer — top-down endless driving on a winding road: steer freely,
// overtake traffic, stay on the asphalt, grab fuel before the tank runs dry.
const TUNING = { speed: 260, maxSpeed: 620, accel: 9, roadW: 210, fuelDrain: 0.055, fuelCan: 0.35, traffic: 1.1 };

const g = KULT.game({
  title: "Turbo Highway",
  hint: "Drag (or arrows) to steer. Overtake traffic, stay on the road, grab fuel!",
  lives: 3,
  background: { deco: "none" },
  hud: { level: true }
});

// Road centre for a given distance travelled (world-space y going up).
function roadX(g, dist) {
  return g.W / 2 + Math.sin(dist * 0.0021) * g.W * 0.16 + Math.sin(dist * 0.0057 + 1.3) * 26;
}
const screenDist = (g, y) => g.data.dist + (g.H - y);

function spawnTraffic(g) {
  const ahead = g.data.dist + g.H + 80;
  const lane = g.pick([-1, 0, 1]);
  const x = roadX(g, ahead) + lane * TUNING.roadW * 0.3;
  g.spawn("traffic", { x, y: -60, h: 66, w: 36, shape: "capsule", color: g.pick(["secondary", "accent", "good"]), tags: ["hazard"], keep: true, data: { speed: g.range(0.35, 0.6), lane }, facing: "up" });
}

g.setup((g) => {
  g.data.dist = 0;
  g.data.speed = TUNING.speed;
  g.data.fuel = 1;
  g.data.offroad = false;
  g.data.player = g.spawn("player", { x: g.W / 2, y: g.H - 120, h: 72, w: 40, shape: "capsule", color: "primary", keep: true, z: 3 });
  g.every(() => Math.max(0.45, TUNING.traffic - g.level * 0.1), () => spawnTraffic(g));
  g.every(5.5, () => {
    const ahead = g.data.dist + g.H + 60;
    g.spawn("fuel", { x: roadX(g, ahead) + g.range(-0.3, 0.3) * TUNING.roadW, y: -40, size: 30, shape: "star", color: "good", glow: "good", keep: true });
  });
  g.every(1.6, () => {
    const ahead = g.data.dist + g.H + 60;
    g.spawn("coin", { x: roadX(g, ahead) + g.range(-0.35, 0.35) * TUNING.roadW, y: -30, r: 11, shape: "circle", color: "primary", glow: "primary", keep: true });
  });

  g.onHit("player", "hazard", (p, t) => {
    if (p.invuln > 0) return;
    t.kill({ burst: { color: "danger", count: 24, speed: 240 } });
    g.sfx("explode");
    p.invuln = 1.5;
    g.data.speed *= 0.5;
    g.loseLife({ title: "WRECKED" });
  });
  g.onHit("player", "fuel", (p, f) => { f.kill({ burst: { color: "good" } }); g.data.fuel = Math.min(1, g.data.fuel + TUNING.fuelCan); g.sfx("power"); g.floatText(f.x, f.y, "FUEL", "good", 18); });
  g.onHit("player", "coin", (p, c) => { c.kill({ burst: { color: "primary", count: 8 } }); g.addScore(10, c.x, c.y, { combo: true }); g.sfx("coin"); });
});

g.update((g, dt) => {
  const p = g.data.player;
  const target = Math.min(TUNING.maxSpeed, TUNING.speed + g.time * 4);
  g.data.speed = g.lerp(g.data.speed, g.data.offroad ? target * 0.45 : target, Math.min(1, dt * (g.data.offroad ? 4 : 0.8)));
  g.data.dist += g.data.speed * dt;
  g.data.fuel -= TUNING.fuelDrain * dt * (0.6 + g.data.speed / TUNING.maxSpeed);
  if (Math.floor(g.data.dist / 6000) + 1 > g.level) g.nextLevel();
  g.data.points = (g.data.points || 0) + g.data.speed * dt * 0.02;
  while (g.data.points >= 1) { g.data.points -= 1; g.score += 1; }

  // Steering: drag toward the finger, or arrows.
  const steer = g.input.down ? g.clamp((g.input.x - p.x) / 40, -1, 1) : g.input.axis().x;
  p.vx = g.lerp(p.vx, steer * 300, Math.min(1, dt * TUNING.accel));
  p.x = g.clamp(p.x + p.vx * dt, 20, g.W - 20);
  p.rot = p.vx / 1200;
  const center = roadX(g, screenDist(g, p.y));
  g.data.offroad = Math.abs(p.x - center) > TUNING.roadW / 2 - 12;
  if (g.data.offroad && g.chance(dt * 20)) g.burst(p.x, p.y + 30, { color: "#9a7b4f", count: 2, speed: 60, gravity: 0, life: 0.4 });

  // Everything on the road scrolls with the player's speed.
  for (const e of g.all("traffic")) e.y += g.data.speed * (1 - e.data.speed) * dt;
  for (const tag of ["fuel", "coin"]) for (const e of g.all(tag)) e.y += g.data.speed * dt;
  for (const tag of ["traffic", "fuel", "coin"]) for (const e of g.all(tag)) if (e.y > g.H + 80) e.kill();
  for (const e of g.all("traffic")) e.x = g.lerp(e.x, roadX(g, screenDist(g, e.y)) + e.data.lane * TUNING.roadW * 0.3, Math.min(1, dt * 3));

  g.hud.set("Speed", `${Math.round(g.data.speed / 3)} km/h`);
  if (g.data.fuel <= 0) g.over({ title: "OUT OF FUEL" });
});

g.drawBehind((ctx, g) => {
  ctx.fillStyle = "#3f8f3f"; ctx.fillRect(0, 0, g.W, g.H);
  const step = 8;
  for (let y = -step; y < g.H + step; y += step) {
    const cx = roadX(g, screenDist(g, y));
    ctx.fillStyle = "#e8e8e8"; ctx.fillRect(cx - TUNING.roadW / 2 - 10, y, TUNING.roadW + 20, step + 1);
    ctx.fillStyle = "#4a4d57"; ctx.fillRect(cx - TUNING.roadW / 2, y, TUNING.roadW, step + 1);
    const stripe = Math.floor((screenDist(g, y)) / 40) % 2 === 0;
    if (stripe) { ctx.fillStyle = "#f5f5f5"; ctx.fillRect(cx - TUNING.roadW * 0.15 - 2, y, 4, step + 1); ctx.fillRect(cx + TUNING.roadW * 0.15 - 2, y, 4, step + 1); }
    const kerb = Math.floor((screenDist(g, y)) / 24) % 2 === 0;
    ctx.fillStyle = kerb ? "#e8443a" : "#ffffff";
    ctx.fillRect(cx - TUNING.roadW / 2 - 10, y, 8, step + 1); ctx.fillRect(cx + TUNING.roadW / 2 + 2, y, 8, step + 1);
  }
});

g.draw((ctx, g) => {
  g.panel(g.W - 30, 96, 18, 140, { r: 9 });
  ctx.fillStyle = g.data.fuel > 0.25 ? g.pal.good : g.pal.danger;
  ctx.fillRect(g.W - 26, 100 + 132 * (1 - g.data.fuel), 10, 132 * g.data.fuel);
  g.text("FUEL", g.W - 21, 250, { size: 10, align: "center", stroke: false });
});
