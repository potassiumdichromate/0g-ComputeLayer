// Recipe: breakout — drag the paddle, bounce the ball, clear the bricks.
const TUNING = { ballSpeed: 360, speedPerLevel: 30, cols: 7, rows: 5 };

const g = KULT.game({
  title: "Brick Smash",
  hint: "Drag to move the paddle. Tap to launch the ball.",
  lives: 3,
  background: { deco: "dots" },
  hud: { level: true }
});

function buildBricks(g) {
  const cols = TUNING.cols;
  const rows = Math.min(8, TUNING.rows + g.level - 1);
  const gap = 6;
  const w = (g.W - 24 - gap * (cols - 1)) / cols;
  const colors = ["accent", "primary", "secondary", "good", "danger"];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const hp = r < Math.floor(g.level / 2) ? 2 : 1;
      g.spawn("brick", {
        x: 12 + w / 2 + c * (w + gap), y: 110 + r * 26, w, h: 20, hp,
        color: colors[r % colors.length], sprite: null, hitbox: 1, label: hp > 1 ? String(hp) : null
      });
    }
  }
}

function resetBall(g) {
  g.clear("ball");
  const p = g.data.paddle;
  g.data.ball = g.spawn("ball", { x: p.x, y: p.top - 12, r: 9, shape: "circle", color: "text", hitbox: 1, bounds: "bounce", glow: "secondary", data: { launched: false, noBottomBounce: true } });
  g.data.launchAt = g.time + 1.2;
}

function launch(g, ball) {
  ball.data.launched = true;
  const speed = TUNING.ballSpeed + (g.level - 1) * TUNING.speedPerLevel;
  const a = -Math.PI / 2 + g.range(-0.4, 0.4);
  ball.vx = Math.cos(a) * speed;
  ball.vy = Math.sin(a) * speed;
  g.sfx("bounce");
}

g.setup((g) => {
  g.data.paddle = g.spawn("paddle", { x: g.W / 2, y: g.H - 70, w: 86, h: 16, shape: "capsule", color: "secondary", hitbox: 1, moves: "drag", movesOpts: { axis: "x", lerp: 22 }, sprite: g.assets.has("player") ? "player" : null, tags: ["player"] });
  buildBricks(g);
  resetBall(g);

  g.onHit("ball", "paddle", (b, p) => {
    if (b.vy <= 0) return;
    const speed = Math.hypot(b.vx, b.vy);
    const offset = g.clamp((b.x - p.x) / (p.w / 2), -1, 1);
    const a = -Math.PI / 2 + offset * 1.05;
    b.vx = Math.cos(a) * speed;
    b.vy = Math.sin(a) * speed;
    b.y = p.top - b.h / 2;
    p.squash = 0.2;
    g.sfx("bounce");
  });
  g.onHit("ball", "brick", (b, k) => {
    if (b.data.hitAt === g.time) return;
    b.data.hitAt = g.time;
    const dx = (b.x - k.x) / (k.w / 2), dy = (b.y - k.y) / (k.h / 2);
    if (Math.abs(dx) > Math.abs(dy)) b.vx = Math.sign(dx || 1) * Math.abs(b.vx);
    else b.vy = Math.sign(dy || 1) * Math.abs(b.vy);
    if (k.hit(1, { burst: { color: g.color(k.color), count: 14 } })) {
      g.addScore(10, k.x, k.y, { combo: true });
      g.sfx("pop");
      g.shake(2, 0.08);
    } else {
      k.label = String(k.hp);
      g.sfx("bounce");
    }
  });
});

g.update((g) => {
  const ball = g.data.ball;
  const p = g.data.paddle;
  if (!ball || ball.dead) return;
  if (!ball.data.launched) {
    ball.x = p.x;
    ball.y = p.top - ball.h / 2 - 2;
    if ((g.input.pressed || g.input.action) || g.time > g.data.launchAt) launch(g, ball);
    return;
  }
  if (Math.abs(ball.vy) < 90) ball.vy = Math.sign(ball.vy || -1) * 90;
  if (ball.y > g.H + 20) {
    ball.kill({ burst: false });
    if (g.loseLife({ title: "OUT OF BALLS" }) > 0) resetBall(g);
    return;
  }
  if (g.count("brick") === 0) {
    g.nextLevel();
    buildBricks(g);
    resetBall(g);
  }
});
