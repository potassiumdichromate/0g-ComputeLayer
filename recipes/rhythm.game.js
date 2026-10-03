// Recipe: rhythm — notes fall down 4 lanes to the hit line on the beat; tap
// the lane (or D F J K / arrows) in time. Perfect/good/miss judgments, combo
// multiplier, health drains on misses, tempo rises each level.
const TUNING = { bpm: 108, bpmPerLevel: 8, lanes: 4, travel: 1.6, perfect: 0.06, good: 0.13, health: 1, missCost: 0.12, healGain: 0.03 };
const LANE_COLORS = ["accent", "secondary", "good", "primary"];
const KEYS = [["KeyD", "ArrowLeft"], ["KeyF", "ArrowDown"], ["KeyJ", "ArrowUp"], ["KeyK", "ArrowRight"]];

const g = KULT.game({
  title: "Beat Lanes",
  hint: "Tap a lane (or D F J K) when its note hits the line. Stay on the beat!",
  lives: 0,
  background: { deco: "grid" },
  hud: { level: true }
});

const hitY = (g) => g.H * 0.82;
const laneX = (g, i) => g.lane(i, TUNING.lanes);

function bpm(g) { return TUNING.bpm + (g.level - 1) * TUNING.bpmPerLevel; }

function schedule(g) {
  // Generate the next bar of notes ahead of time: mostly on beats, some off-beats and chords.
  const beat = 60 / bpm(g);
  for (let i = 0; i < 4; i += 1) {
    const t = g.data.nextBeat + i * beat;
    const lane = g.randInt(0, TUNING.lanes - 1);
    g.data.notes.push({ t, lane, hit: false, missed: false });
    if (g.level >= 2 && g.chance(0.25)) g.data.notes.push({ t: t + beat / 2, lane: g.randInt(0, TUNING.lanes - 1), hit: false, missed: false });
    if (g.level >= 3 && g.chance(0.15)) g.data.notes.push({ t, lane: (lane + 2) % TUNING.lanes, hit: false, missed: false });
  }
  g.data.nextBeat += 4 * beat;
}

function judge(g, lane) {
  g.data.flash[lane] = 0.15;
  let best = null;
  for (const n of g.data.notes) {
    if (n.lane !== lane || n.hit || n.missed) continue;
    const d = Math.abs(n.t - g.data.clock);
    if (d <= TUNING.good && (!best || d < Math.abs(best.t - g.data.clock))) best = n;
  }
  if (!best) return;
  best.hit = true;
  const perfect = Math.abs(best.t - g.data.clock) <= TUNING.perfect;
  g.data.combo += 1;
  g.data.best = Math.max(g.data.best, g.data.combo);
  g.data.health = Math.min(1, g.data.health + TUNING.healGain);
  const mult = 1 + Math.floor(g.data.combo / 10);
  g.addScore((perfect ? 100 : 50) * mult, laneX(g, lane), hitY(g) - 30);
  g.data.label = { text: perfect ? "PERFECT" : "GOOD", t: 0.5, color: perfect ? "primary" : "secondary" };
  g.burst(laneX(g, lane), hitY(g), { color: LANE_COLORS[lane], count: perfect ? 14 : 8, speed: 160, gravity: 0 });
  g.sfx(perfect ? "coin" : "pop");
}

g.setup((g) => {
  g.data.clock = -1.2;
  g.data.nextBeat = 0.4;
  g.data.notes = [];
  g.data.combo = 0;
  g.data.best = 0;
  g.data.health = TUNING.health;
  g.data.flash = [0, 0, 0, 0];
  g.data.label = null;
  g.data.lastTick = -1;
});

g.update((g, dt) => {
  g.data.clock += dt;
  if (g.data.clock + TUNING.travel + 2 > g.data.nextBeat) schedule(g);
  const beatIndex = Math.floor(g.data.clock / (60 / bpm(g)));
  if (beatIndex !== g.data.lastTick && g.data.clock > 0) { g.data.lastTick = beatIndex; if (beatIndex % 2 === 0) g.sfx("click"); }
  if (Math.floor(g.data.clock / 40) + 1 > g.level) g.nextLevel();

  if (g.input.pressed) judge(g, g.clamp(Math.floor(g.input.x / (g.W / TUNING.lanes)), 0, TUNING.lanes - 1));
  KEYS.forEach((codes, lane) => { if (codes.some((c) => g.input.keyPressed(c))) judge(g, lane); });

  for (const n of g.data.notes) {
    if (!n.hit && !n.missed && g.data.clock - n.t > TUNING.good) {
      n.missed = true;
      g.data.combo = 0;
      g.data.health -= TUNING.missCost;
      g.data.label = { text: "MISS", t: 0.5, color: "danger" };
      g.shake(3, 0.1);
    }
  }
  g.data.notes = g.data.notes.filter((n) => g.data.clock - n.t < 0.6);
  g.data.flash = g.data.flash.map((f) => Math.max(0, f - dt));
  if (g.data.label) { g.data.label.t -= dt; if (g.data.label.t <= 0) g.data.label = null; }
  g.hud.set("Combo", g.data.combo);
  if (g.data.health <= 0) g.over({ title: "OFF THE BEAT" });
});

g.draw((ctx, g) => {
  const H = hitY(g), lw = g.W / TUNING.lanes;
  for (let i = 0; i < TUNING.lanes; i += 1) {
    const x = laneX(g, i);
    ctx.fillStyle = `rgba(255,255,255,${0.04 + g.data.flash[i] * 1.2})`;
    ctx.fillRect(x - lw / 2 + 4, 90, lw - 8, g.H - 90);
    ctx.strokeStyle = g.color(LANE_COLORS[i]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, H, 24, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fillRect(0, H - 1, g.W, 2);
  const speed = (H - 90) / TUNING.travel;
  for (const n of g.data.notes) {
    if (n.hit) continue;
    const y = H - (n.t - g.data.clock) * speed;
    if (y < 70 || y > g.H + 30) continue;
    const x = laneX(g, n.lane);
    ctx.globalAlpha = n.missed ? 0.3 : 1;
    if (!g.sprite("note", x, y, 46, 46)) {
      ctx.fillStyle = g.color(LANE_COLORS[n.lane]);
      ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(14,10,32,0.9)"; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.arc(x - 6, y - 7, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (g.data.label) g.text(g.data.label.text, g.W / 2, H - 90, { font: "display", size: 30 + g.data.label.t * 12, align: "center", baseline: "middle", color: g.data.label.color });
  // Health bar
  g.panel(g.W / 2 - 80, g.H - 30, 160, 16, { r: 8 });
  ctx.fillStyle = g.data.health > 0.3 ? g.pal.good : g.pal.danger;
  ctx.fillRect(g.W / 2 - 76, g.H - 26, 152 * Math.max(0, g.data.health), 8);
});
