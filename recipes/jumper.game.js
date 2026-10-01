// Recipe: jumper — auto-bounce upward on one-way platforms, camera climbs.
const TUNING = { bounce: 640, gravity: 1150, speed: 210, gapMin: 60, gapMax: 115 };

const g = KULT.game({
  title: "Sky Climber",
  hint: "Hold the left or right side (or arrows) to steer. Bounce as high as you can!",
  lives: 0,
  background: { deco: "stars" },
  hud: { level: true }
});

function spawnPlatform(g, y) {
  const width = Math.max(48, 86 - g.level * 4);
  const roll = g.rand();
  const kind = g.level > 1 && roll < 0.2 ? "moving" : g.level > 2 && roll < 0.32 ? "fragile" : "normal";
  const p = g.spawn("platform", {
    x: g.range(width / 2 + 6, g.W - width / 2 - 6), y, w: width, h: 14,
    solid: true, oneWay: true, sprite: null, pop: false,
    color: kind === "fragile" ? "danger" : kind === "moving" ? "secondary" : "good",
    data: { kind }
  });
  if (kind === "moving") p.moves("patrol", { from: width / 2 + 6, to: g.W - width / 2 - 6, speed: 60 + g.level * 10 });
  if (g.chance(0.22)) g.spawn("coin", { x: p.x, y: y - 34, r: 10, shape: "circle", color: "primary", glow: "primary" });
  g.data.highest = y;
}

g.setup((g) => {
  g.data.highest = g.H;
  g.data.startY = g.H - 80;
  g.data.peak = 0;
  const player = g.spawn("player", {
    x: g.W / 2, y: g.H - 130, h: 46, shape: "blob", color: "primary", face: true, bounds: "wrapX", keep: true,
    moves: "platformer", movesOpts: { speed: TUNING.speed, jump: TUNING.bounce, gravity: TUNING.gravity, variableJump: false }
  });
  g.data.player = player;
  g.spawn("platform", { x: g.W / 2, y: g.H - 80, w: 140, h: 16, solid: true, oneWay: true, color: "good", sprite: null, pop: false, data: { kind: "normal" } });
  g.data.highest = g.H - 80;
  while (g.data.highest > -g.H) spawnPlatform(g, g.data.highest - g.range(TUNING.gapMin, TUNING.gapMax));
  g.follow(player, { y: true, x: false, onlyUp: true, anchorY: 0.45, lerp: 6 });

  g.onHit("player", "coin", (p, c) => {
    c.kill({ burst: { color: "primary", count: 10 } });
    g.addScore(25, c.x, c.y - 16, { combo: true });
    g.sfx("coin");
  });
});

g.update((g) => {
  const p = g.data.player;
  if (!p || p.dead) return;
  if (p.grounded && p.vy >= 0) {
    const plat = p.data.landedOn;
    p.vy = -TUNING.bounce;
    p.grounded = false;
    p.squash = -0.25;
    g.sfx("jump");
    g.burst(p.x, p.bottom, { color: "text", count: 5, speed: 80, size: 3, gravity: 0 });
    if (plat && plat.data.kind === "fragile") plat.kill({ burst: { color: "danger", count: 12 } });
  }
  const climbed = Math.max(0, Math.round((g.data.startY - p.y) / 10));
  if (climbed > g.data.peak) { g.score += climbed - g.data.peak; g.data.peak = climbed; }
  if (Math.floor(g.data.peak / 250) + 1 > g.level) g.nextLevel();
  while (g.data.highest > g.camera.y - 120) spawnPlatform(g, g.data.highest - g.range(TUNING.gapMin, TUNING.gapMax + g.level * 4));
  if (p.y > g.camera.y + g.H + 60) {
    p.kill({ burst: false });
    g.over({ title: "FELL!" });
  }
});
