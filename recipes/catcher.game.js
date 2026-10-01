// Recipe: catcher — drag to catch falling good items, avoid the bad ones.
const TUNING = { startFall: 150, maxFall: 380, rampSeconds: 70, badChance: 0.28 };

const g = KULT.game({
  title: "Fruit Catch",
  hint: "Drag to move the basket. Catch the good stuff, dodge the bombs!",
  lives: 3,
  background: { deco: "bubbles" },
  hud: { level: true }
});

function spawnItem(g) {
  const bad = g.chance(TUNING.badChance + g.level * 0.02);
  const speed = g.ramp(TUNING.startFall, TUNING.maxFall, TUNING.rampSeconds) * g.range(0.85, 1.15);
  g.spawn(bad ? "bomb" : "item", {
    x: g.range(24, g.W - 24), y: -24, r: bad ? 15 : 14, shape: bad ? "circle" : "blob",
    color: bad ? "danger" : g.pick(["primary", "good", "accent"]), face: !bad, vy: speed,
    spin: g.range(-2, 2), bounds: "none", ttl: (g.H + 100) / speed + 1, glow: bad ? "danger" : null
  });
}

g.setup((g) => {
  g.data.caught = 0;
  g.data.player = g.spawn("player", { x: g.W / 2, y: g.H - 70, h: 44, w: 84, shape: "capsule", color: "secondary", moves: "drag", movesOpts: { axis: "x", lerp: 18 } });
  g.every(() => Math.max(0.32, 0.95 - g.level * 0.07), () => spawnItem(g));

  g.onHit("player", "item", (p, item) => {
    item.kill({ burst: { color: g.color(item.color), count: 10 } });
    p.squash = 0.18;
    g.addScore(10, item.x, item.y - 16, { combo: true });
    g.sfx("coin");
    g.data.caught += 1;
    if (g.data.caught % 20 === 0) g.nextLevel();
  });
  g.onHit("player", "bomb", (p, bomb) => {
    bomb.kill({ burst: { color: "danger", count: 24, speed: 240 } });
    g.sfx("explode");
    g.loseLife({ title: "KABOOM!" });
  });
});

g.update((g) => {
  for (const item of g.all("item")) {
    if (item.y > g.H + 10) {
      item.kill({ burst: false });
      g.floatText(item.x, g.H - 30, "MISS", "danger", 16);
      g.loseLife({ title: "TOO MANY MISSES" });
    }
  }
});
