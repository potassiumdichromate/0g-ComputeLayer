// Recipe: platformer — side-scrolling level: run and jump across platforms and
// gaps, stomp patrolling enemies, collect coins, reach the flag. Each level is
// generated longer and harder; falling costs a life and respawns you.
const TUNING = { speed: 175, jump: 520, gravity: 1350, levelLength: 2600, lengthPerLevel: 500 };

const g = KULT.game({
  title: "Pixel Quest",
  hint: "Hold left/right side to run, tap to jump. Stomp enemies, reach the flag!",
  lives: 3,
  background: { deco: "hills" },
  hud: { level: true }
});

const groundY = (g) => g.H - 90;

function buildLevel(g) {
  g.clear("solid"); g.clear("coin"); g.clear("enemy"); g.clear("flag");
  const length = TUNING.levelLength + (g.level - 1) * TUNING.lengthPerLevel;
  let x = 0;
  const ground = groundY(g);
  g.data.segments = [];
  while (x < length) {
    const w = x === 0 ? 420 : g.range(160, 360);
    const lift = x === 0 ? 0 : g.pick([0, 0, -40, -80, 30]);
    const y = ground + lift;
    g.spawn("ground", { x: x + w / 2, y: y + 60, w, h: 120, solid: true, tags: ["solid"], color: "good", sprite: null, keep: true, pop: false, z: -1 });
    g.data.segments.push({ x, w, y });
    if (x > 0 && g.chance(0.45)) {
      const ex = x + g.range(40, w - 40);
      g.spawn("enemy", { x: ex, y: y - 18, h: 34, shape: "blob", face: true, color: "danger", gravity: 0, keep: true, tags: ["enemy"] })
        .moves("patrol", { from: x + 18, to: x + w - 18, speed: 50 + g.level * 8 });
    }
    for (let i = 0; i < 3; i += 1) if (g.chance(0.5)) g.spawn("coin", { x: x + w / 2 + (i - 1) * 30, y: y - 70 - (i === 1 ? 14 : 0), r: 10, shape: "circle", color: "primary", glow: "primary", keep: true });
    if (g.chance(0.35)) {
      const px = x + w * 0.5, py = y - g.range(110, 150);
      g.spawn("platform", { x: px, y: py, w: 90, h: 18, solid: true, oneWay: true, tags: ["solid"], color: "secondary", sprite: null, keep: true, pop: false });
      g.spawn("coin", { x: px, y: py - 30, r: 10, shape: "circle", color: "primary", glow: "primary", keep: true });
    }
    x += w + (x === 0 ? 70 : g.range(60, 110 + g.level * 8));
  }
  const last = g.data.segments[g.data.segments.length - 1];
  g.spawn("flag", { x: last.x + last.w - 40, y: last.y - 45, w: 30, h: 90, shape: "rect", color: "primary", keep: true, sprite: g.assets.has("flag") ? "flag" : null });
  g.data.checkpoint = { x: 80, y: ground - 80 };
}

function respawn(g) {
  const p = g.data.player;
  p.x = g.data.checkpoint.x; p.y = g.data.checkpoint.y; p.vx = 0; p.vy = 0; p.invuln = 1.2;
}

g.setup((g) => {
  g.data.player = g.spawn("player", {
    x: 80, y: groundY(g) - 80, h: 54, shape: "blob", color: "primary", face: true, keep: true, z: 3, shadow: false,
    moves: "platformer", movesOpts: { speed: TUNING.speed, jump: TUNING.jump, gravity: TUNING.gravity }
  });
  g.follow(g.data.player, { x: true, y: false, anchorX: 0.35, lerp: 9 });
  buildLevel(g);

  g.onHit("player", "coin", (p, c) => { c.kill({ burst: { color: "primary", count: 8 } }); g.addScore(10, c.x, c.y, { combo: true }); g.sfx("coin"); });
  g.onHit("player", "enemy", (p, e) => {
    if (p.vy > 60 && p.bottom < e.y + 4) {
      e.kill({ burst: { color: "danger", count: 16 } });
      p.vy = -TUNING.jump * 0.6;
      g.addScore(50, e.x, e.y - 20);
      g.sfx("pop"); g.shake(3, 0.1);
    } else if (p.invuln <= 0) {
      p.invuln = 1.4; p.vy = -300; p.vx = (p.x < e.x ? -1 : 1) * 200;
      g.loseLife({ title: "DEFEATED" });
    }
  });
  g.onHit("player", "flag", (p, f) => {
    if (g.data.finishing) return;
    g.data.finishing = true;
    g.addScore(200, f.x, f.y - 60);
    g.burst(f.x, f.y - 40, { color: ["primary", "good", "secondary"], count: 40, speed: 280 });
    g.sfx("win");
    g.after(0.8, () => { g.nextLevel(); buildLevel(g); respawn(g); g.data.finishing = false; });
  });
});

g.update((g) => {
  const p = g.data.player;
  for (const seg of g.data.segments) if (p.x > seg.x && p.x < seg.x + seg.w && p.grounded) g.data.checkpoint = { x: seg.x + 40, y: seg.y - 80 };
  if (p.y > g.H + 120) {
    g.sfx("lose");
    if (g.loseLife({ title: "FELL!" }) > 0) respawn(g);
  }
  if (p.x < g.camera.x + 10) p.x = g.camera.x + 10;
  g.bg.speedX = 0;
});
