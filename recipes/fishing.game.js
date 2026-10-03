// Recipe: fishing — hold to drop the hook, steer by dragging, release to reel
// up. Hooked fish start a tension fight: hold to reel, release to ease, keep
// the marker in the zone. Rare fish pay more; jellyfish sting. Timed run.
const TUNING = { timeLimit: 75, sink: 170, reel: 260, fishMin: 5, fight: 2.2 };
const FISH = [
  { name: "fish_small", pts: 10, speed: 70, size: 30, color: "secondary", weight: 5, pull: 0.6 },
  { name: "fish_big", pts: 30, speed: 50, size: 46, color: "primary", weight: 3, pull: 0.9 },
  { name: "fish_rare", pts: 80, speed: 120, size: 38, color: "accent", weight: 1, pull: 1.3 }
];

const g = KULT.game({
  title: "Deep Hook",
  hint: "Hold to lower the hook, drag to steer, release to reel up. Win the tug-of-war!",
  lives: 3,
  background: { deco: "bubbles" },
  hud: { level: true }
});

const water = (g) => g.H * 0.26;

function spawnFish(g) {
  const roll = g.rand() * 9;
  const kind = roll < 5 ? FISH[0] : roll < 8 ? FISH[1] : FISH[2];
  const jelly = g.chance(0.18 + g.level * 0.03);
  const dir = g.chance(0.5) ? 1 : -1;
  const depth = g.range(water(g) + 60, g.H - 40);
  const e = g.spawn(jelly ? "jellyfish" : kind.name, {
    x: dir > 0 ? -40 : g.W + 40, y: depth, h: jelly ? 36 : kind.size, shape: jelly ? "blob" : "capsule", face: true,
    color: jelly ? "danger" : kind.color, vx: dir * (jelly ? 30 : kind.speed) * (1 + g.level * 0.08), tags: [jelly ? "hazard" : "fish"],
    ttl: (g.W + 120) / ((jelly ? 30 : kind.speed) * 0.9), data: { kind: jelly ? null : kind }
  });
  e.flipX = dir < 0;
  e.moves("sine", { amp: jelly ? 22 : 8, freq: jelly ? 0.5 : 0.8, axis: "y" });
}

g.setup((g) => {
  g.data.time = TUNING.timeLimit;
  g.data.boatX = g.W / 2;
  g.data.hookY = water(g) - 10;
  g.data.state = "idle"; // idle | down | up | fight
  g.data.caught = null;
  g.data.tension = 0.5;
  g.data.zone = 0.5;
  g.data.fightT = 0;
  g.every(() => Math.max(0.5, 1.4 - g.level * 0.1), () => { if (g.count("fish") + g.count("hazard") < 9) spawnFish(g); });
  for (let i = 0; i < TUNING.fishMin; i += 1) spawnFish(g);

  g.onHit("hook", "fish", (h, f) => {
    if (g.data.state !== "down" && g.data.state !== "up") return;
    g.data.state = "fight";
    g.data.caught = f;
    f.vx = 0; f.brains = [];
    g.data.tension = 0.5; g.data.zone = 0.5; g.data.fightT = 0;
    g.sfx("pop");
  });
  g.onHit("hook", "hazard", (h, j) => {
    if (g.data.state === "fight" || g.data.state === "idle") return;
    j.kill({ burst: { color: "danger" } });
    g.data.state = "up";
    g.flash("danger", 0.25);
    g.loseLife({ title: "STUNG!" });
  });
});

g.update((g, dt) => {
  g.data.time -= dt;
  g.hud.set("Time", Math.max(0, Math.ceil(g.data.time)));
  if (g.data.time <= 0) { g.over({ title: "TIME'S UP", win: g.score > 0 }); return; }
  if (Math.floor((TUNING.timeLimit - g.data.time) / 25) + 1 > g.level) g.nextLevel();

  if (g.input.down) g.data.boatX = g.lerp(g.data.boatX, g.clamp(g.input.x, 30, g.W - 30), Math.min(1, dt * 6));
  g.data.boatX = g.clamp(g.data.boatX + g.input.axis().x * 220 * dt, 30, g.W - 30);
  const s = g.data.state;
  const hold = g.input.held;

  if (s === "idle" && hold) g.data.state = "down";
  if (s === "down") {
    g.data.hookY += TUNING.sink * dt;
    if (!hold || g.data.hookY > g.H - 20) g.data.state = "up";
  }
  if (s === "up") {
    g.data.hookY -= TUNING.reel * dt;
    if (g.data.hookY <= water(g) - 10) { g.data.hookY = water(g) - 10; g.data.state = "idle"; }
  }
  if (s === "fight") {
    const f = g.data.caught;
    const pull = f && f.data.kind ? f.data.kind.pull : 1;
    // The zone wanders with the fish; holding raises tension, releasing lowers it.
    g.data.zone = g.clamp(g.data.zone + Math.sin(g.time * 3.1 * pull) * dt * 0.6 * pull, 0.2, 0.8);
    g.data.tension = g.clamp(g.data.tension + (hold ? 0.9 : -0.8) * dt, 0, 1);
    const inZone = Math.abs(g.data.tension - g.data.zone) < 0.14;
    g.data.fightT += inZone ? dt : -dt * 0.4;
    g.data.fightT = Math.max(0, g.data.fightT);
    if (f && !f.dead) { f.x = g.data.boatX; f.y = g.data.hookY + 10; }
    if (g.data.tension >= 1 || g.data.tension <= 0) {
      g.floatText(g.data.boatX, g.data.hookY, "SNAP!", "danger", 24);
      if (f) f.kill({ burst: false });
      g.data.caught = null; g.data.state = "up";
      g.sfx("hit"); g.shake(4, 0.2);
    } else if (g.data.fightT >= TUNING.fight) {
      const pts = f && f.data.kind ? f.data.kind.pts : 10;
      g.addScore(pts, g.data.boatX, water(g) - 30, { combo: true });
      g.burst(g.data.boatX, water(g), { color: ["primary", "secondary"], count: 22 });
      g.sfx(pts >= 80 ? "win" : "coin");
      if (f) f.kill({ burst: false });
      g.data.caught = null; g.data.state = "up";
    }
  }
  const hook = g.first("hook") || g.spawn("hook", { x: g.data.boatX, y: g.data.hookY, size: 18, sprite: null, alpha: 0, keep: true, pop: false });
  hook.x = g.data.boatX; hook.y = g.data.hookY;
});

g.drawBehind((ctx, g) => {
  const w = water(g);
  const sky = ctx.createLinearGradient(0, 0, 0, w);
  sky.addColorStop(0, "#7fd0ff"); sky.addColorStop(1, "#c9ecff");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, g.W, w);
  const sea = ctx.createLinearGradient(0, w, 0, g.H);
  sea.addColorStop(0, g.shade(g.pal.secondary, -0.2)); sea.addColorStop(1, g.shade(g.pal.bg1, -0.3));
  ctx.fillStyle = sea; ctx.fillRect(0, w, g.W, g.H - w);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let x = -20; x < g.W + 20; x += 24) { ctx.beginPath(); ctx.arc(x + Math.sin(g.time * 2 + x) * 3, w, 10, Math.PI, 0); ctx.fill(); }
});

g.draw((ctx, g) => {
  const w = water(g), bx = g.data.boatX;
  if (!g.sprite("boat", bx, w - 26, 110, 70)) {
    ctx.fillStyle = "#b5651d"; ctx.beginPath(); ctx.moveTo(bx - 50, w - 30); ctx.lineTo(bx + 50, w - 30); ctx.lineTo(bx + 34, w - 6); ctx.lineTo(bx - 34, w - 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(14,10,32,0.85)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = g.pal.primary; ctx.beginPath(); ctx.arc(bx, w - 46, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(bx + 18, w - 60); ctx.lineTo(bx, g.data.hookY); ctx.stroke();
  ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(bx - 4, g.data.hookY + 4, 6, 0, Math.PI); ctx.stroke();
  if (g.data.state === "fight") {
    const mx = g.W - 44, my = g.H * 0.36, mh = g.H * 0.4;
    g.panel(mx - 14, my - 10, 28, mh + 20, { r: 14 });
    ctx.fillStyle = "rgba(93,255,143,0.45)"; ctx.fillRect(mx - 8, my + (1 - g.data.zone - 0.14) * mh, 16, 0.28 * mh);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(mx - 12, my + (1 - g.data.tension) * mh - 3, 24, 6);
    g.text("REEL", mx, my - 18, { size: 11, align: "center", stroke: false });
    ctx.fillStyle = g.pal.primary;
    ctx.fillRect(20, g.H - 18, (g.W - 40) * Math.min(1, g.data.fightT / TUNING.fight), 6);
  }
});
