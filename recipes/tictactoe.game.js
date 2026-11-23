// Recipe: tictactoe — X (you) vs O (computer) on a 3x3 board. Level 1 the AI
// makes mistakes, level 2 it wins and blocks, level 3+ it plays perfectly
// (minimax). Wins score and level up, draws score a little, losses cost a life.
// Starting player alternates every round.
const TUNING = { aiDelay: 0.5, winScore: 100, drawScore: 30, mistakeChance: [0.45, 0.15, 0] };
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

const g = KULT.game({
  hero: (ctx, g, s) => { mark(ctx, g, "X", -s * 0.34, 0, s * 0.8, 0); mark(ctx, g, "O", s * 0.34, 0, s * 0.8, 0); },
  title: "Triple Tac",
  hint: "Tap a square to place your X. Three in a row wins!",
  lives: 3,
  background: { deco: "grid" },
  hud: { level: true }
});

const winner = (b) => { for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { who: b[l[0]], line: l }; return null; };

function minimax(b, who) {
  const w = winner(b);
  if (w) return w.who === "O" ? 10 : -10;
  if (b.every(Boolean)) return 0;
  const scores = [];
  for (let i = 0; i < 9; i += 1) if (!b[i]) { b[i] = who; scores.push(minimax(b, who === "O" ? "X" : "O")); b[i] = null; }
  return who === "O" ? Math.max(...scores) - 1 : Math.min(...scores) + 1;
}

function aiPick(g) {
  const b = g.data.board, free = [];
  for (let i = 0; i < 9; i += 1) if (!b[i]) free.push(i);
  const mistake = TUNING.mistakeChance[Math.min(TUNING.mistakeChance.length - 1, g.level - 1)];
  if (g.chance(mistake)) return g.pick(free);
  let best = free[0], bestV = -Infinity;
  for (const i of free) { b[i] = "O"; const v = minimax(b, "X") + g.range(0, 0.5); b[i] = null; if (v > bestV) { bestV = v; best = i; } }
  return best;
}

function newRound(g) {
  g.data.board = new Array(9).fill(null);
  g.data.turn = g.data.youStart ? "X" : "O";
  g.data.done = null;
  g.data.pops = new Array(9).fill(0);
  g.data.aiTimer = TUNING.aiDelay + 0.3;
  g.data.status = g.data.turn === "X" ? "Your turn" : "Computer goes first";
}

function place(g, i, who) {
  const grid = g.data.grid;
  g.data.board[i] = who;
  g.data.pops[i] = 1;
  g.sfx(who === "X" ? "pop" : "click");
  const w = winner(g.data.board);
  const full = g.data.board.every(Boolean);
  if (w || full) {
    g.data.done = { w, t: 0 };
    const mid = grid.toPx(1, 1);
    if (w && w.who === "X") {
      g.data.status = "Three in a row!";
      g.addScore(TUNING.winScore * g.level, mid.x, mid.y, { combo: true });
      g.sfx("win"); g.flash("good", 0.2);
      for (const k of w.line) { const q = grid.toPx(k % 3, Math.floor(k / 3)); g.burst(q.x, q.y, { color: "good", count: 14 }); }
      g.after(1.4, () => { g.nextLevel(); g.data.youStart = !g.data.youStart; newRound(g); });
    } else if (w) {
      g.data.status = "The computer wins this one";
      g.loseLife();
      g.after(1.4, () => { if (g.lives > 0) { g.data.youStart = !g.data.youStart; newRound(g); } });
    } else {
      g.data.status = "Draw";
      g.addScore(TUNING.drawScore, mid.x, mid.y);
      g.after(1.1, () => { g.data.youStart = !g.data.youStart; newRound(g); });
    }
    return;
  }
  g.data.turn = who === "X" ? "O" : "X";
  g.data.status = g.data.turn === "X" ? "Your turn" : "Computer is thinking…";
  if (g.data.turn === "O") g.data.aiTimer = TUNING.aiDelay;
}

g.setup((g) => {
  g.data.grid = g.grid({ cols: 3, rows: 3, gap: 10, offsetY: 0, heightFrac: 0.5 });
  g.data.youStart = true;
  newRound(g);
});

g.update((g, dt) => {
  for (let i = 0; i < 9; i += 1) g.data.pops[i] = Math.max(0, g.data.pops[i] - dt * 4);
  if (g.data.done) { g.data.done.t += dt; return; }
  if (g.data.turn === "O") {
    g.data.aiTimer -= dt;
    if (g.data.aiTimer <= 0) place(g, aiPick(g), "O");
    return;
  }
  for (const tap of g.input.taps) {
    const cell = g.data.grid.cellAt(tap.x, tap.y);
    if (!cell) continue;
    const i = cell.r * 3 + cell.c;
    if (g.data.board[i]) { g.shake(2, 0.08); g.sfx("hit"); continue; }
    place(g, i, "X");
    return;
  }
});

function mark(ctx, g, who, x, y, s, k) {
  if (g.sprite(who === "X" ? "x_mark" : "o_mark", x, y, s * 0.78 * (1 + k * 0.25), s * 0.78 * (1 + k * 0.25))) return;
  const r = s * 0.3 * (1 + k * 0.25);
  ctx.save();
  ctx.lineCap = "round"; ctx.lineWidth = s * 0.13;
  ctx.strokeStyle = who === "X" ? g.color("primary") : g.color("danger");
  ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 14;
  ctx.beginPath();
  if (who === "X") { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); }
  else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

g.draw((ctx, g) => {
  const grid = g.data.grid, s = grid.cell;
  grid.draw(ctx);
  for (let i = 0; i < 9; i += 1) {
    const v = g.data.board[i];
    if (!v) continue;
    const q = grid.toPx(i % 3, Math.floor(i / 3));
    mark(ctx, g, v, q.x, q.y, s, g.data.pops[i]);
  }
  const d = g.data.done;
  if (d && d.w) {
    const a = grid.toPx(d.w.line[0] % 3, Math.floor(d.w.line[0] / 3)), z = grid.toPx(d.w.line[2] % 3, Math.floor(d.w.line[2] / 3));
    const t = Math.min(1, d.t * 3);
    ctx.save(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (z.x - a.x) * t, a.y + (z.y - a.y) * t); ctx.stroke(); ctx.restore();
  }
  g.text(g.data.status, g.W / 2, grid.y + grid.h + 46, { size: 20, color: g.data.turn === "X" ? "text" : "accent", align: "center", font: "display" });
  g.text("YOU  X", g.W / 2 - 80, grid.y - 30, { size: 15, color: "primary", align: "center", font: "ui" });
  g.text("O  CPU", g.W / 2 + 80, grid.y - 30, { size: 15, color: "danger", align: "center", font: "ui" });
});
