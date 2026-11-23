// Recipe: connect4 — drop discs into a 7x6 board against a computer; four in a
// row (across, down or diagonal) wins. Tap a column to drop. A lost round costs
// a life; a win scores, levels up and the AI looks further ahead.
const TUNING = { cols: 7, rows: 6, aiDelay: 0.45, winScore: 200, drawScore: 50, depths: [2, 4, 5, 6] };

const g = KULT.game({
  hero: (ctx, g, s) => { disc(ctx, g, 1, -s * 0.3, 0, s * 0.34); disc(ctx, g, 2, s * 0.3, 0, s * 0.34); },
  title: "Four Drop",
  hint: "Tap a column to drop your disc. Get four in a row before the computer!",
  lives: 3,
  background: { deco: "bubbles" },
  hud: { level: true }
});

const YOU = 1, CPU = 2;

function emptyBoard() { return new Array(TUNING.cols * TUNING.rows).fill(0); }
const at = (b, c, r) => b[r * TUNING.cols + c];

function dropRow(b, c) {
  for (let r = TUNING.rows - 1; r >= 0; r -= 1) if (!at(b, c, r)) return r;
  return -1;
}

function lineAt(b, who) {
  const C = TUNING.cols, R = TUNING.rows;
  for (let r = 0; r < R; r += 1) for (let c = 0; c < C; c += 1) {
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const cells = [];
      for (let k = 0; k < 4; k += 1) {
        const cc = c + dc * k, rr = r + dr * k;
        if (cc < 0 || cc >= C || rr < 0 || rr >= R || at(b, cc, rr) !== who) break;
        cells.push([cc, rr]);
      }
      if (cells.length === 4) return cells;
    }
  }
  return null;
}

function scoreWindow(w) {
  const mine = w.filter((v) => v === CPU).length, theirs = w.filter((v) => v === YOU).length, empty = w.filter((v) => !v).length;
  if (mine === 4) return 1000;
  if (mine === 3 && empty === 1) return 6;
  if (mine === 2 && empty === 2) return 2;
  if (theirs === 3 && empty === 1) return -8;
  if (theirs === 2 && empty === 2) return -2;
  return 0;
}

function evaluate(b) {
  const C = TUNING.cols, R = TUNING.rows;
  let s = 0;
  for (let r = 0; r < R; r += 1) if (at(b, Math.floor(C / 2), r) === CPU) s += 3;
  for (let r = 0; r < R; r += 1) for (let c = 0; c < C; c += 1) for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const ec = c + dc * 3, er = r + dr * 3;
    if (ec < 0 || ec >= C || er < 0 || er >= R) continue;
    s += scoreWindow([0, 1, 2, 3].map((k) => at(b, c + dc * k, r + dr * k)));
  }
  return s;
}

const ORDER = [3, 2, 4, 1, 5, 0, 6];
function negamax(b, depth, alpha, beta, who, budget) {
  budget.n += 1;
  const other = who === CPU ? YOU : CPU;
  if (lineAt(b, other)) return -100000 - depth;
  const cols = ORDER.filter((c) => c < TUNING.cols && dropRow(b, c) >= 0);
  if (!cols.length) return 0;
  if (depth === 0 || budget.n > budget.max) return who === CPU ? evaluate(b) : -evaluate(b);
  let best = -Infinity;
  for (const c of cols) {
    const nb = b.slice(); nb[dropRow(b, c) * TUNING.cols + c] = who;
    const v = -negamax(nb, depth - 1, -beta, -alpha, other, budget);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function aiColumn(g) {
  const b = g.data.board;
  const depth = TUNING.depths[Math.min(TUNING.depths.length - 1, g.level - 1)];
  const noise = Math.max(0, 40 - g.level * 15);
  const budget = { n: 0, max: 60000 };
  let best = -1, bestV = -Infinity;
  for (const c of ORDER) {
    if (c >= TUNING.cols || dropRow(b, c) < 0) continue;
    const nb = b.slice(); nb[dropRow(b, c) * TUNING.cols + c] = CPU;
    const v = -negamax(nb, depth - 1, -Infinity, Infinity, YOU, budget) + g.range(-noise, noise);
    if (v > bestV) { bestV = v; best = c; }
  }
  return best;
}

function newRound(g) {
  g.data.board = emptyBoard();
  g.data.turn = g.data.youStart ? YOU : CPU;
  g.data.drop = null;
  g.data.win = null;
  g.data.over = false;
  g.data.aiTimer = TUNING.aiDelay + 0.3;
  g.data.status = g.data.turn === YOU ? "Your turn" : "Computer starts";
}

function drop(g, c, who) {
  const r = dropRow(g.data.board, c);
  if (r < 0) { g.shake(2, 0.08); g.sfx("hit"); return false; }
  const grid = g.data.grid;
  g.data.board[r * TUNING.cols + c] = who;
  g.data.drop = { c, r, who, y: grid.y - grid.cell, vy: 0 };
  g.sfx("pop");
  const line = lineAt(g.data.board, who);
  const full = g.data.board.every(Boolean);
  if (line || full) {
    g.data.over = true;
    g.data.win = line;
    g.after(0.5, () => {
      const mid = grid.toPx(TUNING.cols / 2 - 0.5, TUNING.rows / 2 - 0.5);
      if (line && who === YOU) {
        g.data.status = "Four in a row! You win";
        g.addScore(TUNING.winScore * g.level, mid.x, mid.y, { combo: true });
        g.sfx("win"); g.flash("good", 0.25);
        for (const [cc, rr] of line) { const q = grid.toPx(cc, rr); g.burst(q.x, q.y, { color: "good", count: 14, speed: 170 }); }
        g.after(1.4, () => { g.nextLevel(); g.data.youStart = !g.data.youStart; newRound(g); });
      } else if (line) {
        g.data.status = "The computer connected four";
        g.loseLife();
        g.after(1.4, () => { if (g.lives > 0) { g.data.youStart = !g.data.youStart; newRound(g); } });
      } else {
        g.data.status = "Board full: draw";
        g.addScore(TUNING.drawScore, mid.x, mid.y);
        g.after(1.2, () => { g.data.youStart = !g.data.youStart; newRound(g); });
      }
    });
    return true;
  }
  g.data.turn = who === YOU ? CPU : YOU;
  g.data.status = g.data.turn === YOU ? "Your turn" : "Computer is thinking…";
  if (g.data.turn === CPU) g.data.aiTimer = TUNING.aiDelay;
  return true;
}

g.setup((g) => {
  g.data.grid = g.grid({ cols: TUNING.cols, rows: TUNING.rows, gap: 4, offsetY: 20, heightFrac: 0.56 });
  g.data.youStart = true;
  g.data.hover = Math.floor(TUNING.cols / 2);
  newRound(g);
});

g.update((g, dt) => {
  const grid = g.data.grid;
  const d = g.data.drop;
  if (d) {
    const target = grid.toPx(d.c, d.r).y;
    d.vy += 2600 * dt; d.y += d.vy * dt;
    if (d.y >= target) { d.y = target; if (d.vy > 300) { d.vy *= -0.28; g.sfx("bounce"); } else g.data.drop = null; }
  }
  if (g.data.over || g.data.drop) return;
  if (g.data.turn === CPU) {
    g.data.aiTimer -= dt;
    if (g.data.aiTimer <= 0) { const c = aiColumn(g); if (c >= 0) drop(g, c, CPU); }
    return;
  }
  if (g.input.held) {
    const c = Math.floor((g.input.x - grid.x) / (grid.cell + grid.gap));
    if (c >= 0 && c < TUNING.cols) g.data.hover = c;
  }
  if (g.input.swipe === "left") g.data.hover = Math.max(0, g.data.hover - 1);
  if (g.input.swipe === "right") g.data.hover = Math.min(TUNING.cols - 1, g.data.hover + 1);
  if (g.input.action) { drop(g, g.data.hover, YOU); return; }
  for (const tap of g.input.taps) {
    const c = Math.floor((tap.x - grid.x) / (grid.cell + grid.gap));
    if (c >= 0 && c < TUNING.cols && tap.y > grid.y - grid.cell * 1.5 && tap.y < grid.y + grid.h + 10) { g.data.hover = c; drop(g, c, YOU); return; }
  }
});

function disc(ctx, g, who, x, y, r, alpha) {
  const name = who === YOU ? "player_disc" : "cpu_disc";
  if (g.sprite(name, x, y, r * 2, r * 2, { alpha })) return;
  ctx.save();
  ctx.globalAlpha *= alpha == null ? 1 : alpha;
  const base = who === YOU ? g.color("primary") : g.color("danger");
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  grad.addColorStop(0, g.shade(base, 0.35)); grad.addColorStop(1, g.shade(base, -0.2));
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = g.shade(base, -0.45); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

g.draw((ctx, g) => {
  const grid = g.data.grid, s = grid.cell, b = g.data.board, rr = s * 0.4;
  // Disc preview above the hovered column.
  if (!g.data.over && g.data.turn === YOU && !g.data.drop) {
    const q = grid.toPx(g.data.hover, 0);
    disc(ctx, g, YOU, q.x, grid.y - s * 0.75 + Math.sin(g.time * 5) * 3, rr, 0.85);
  }
  // Board: a solid frame with holes, discs drawn behind it.
  for (let r = 0; r < TUNING.rows; r += 1) for (let c = 0; c < TUNING.cols; c += 1) {
    const v = at(b, c, r);
    if (!v) continue;
    const d = g.data.drop;
    if (d && d.c === c && d.r === r) continue;
    const q = grid.toPx(c, r);
    disc(ctx, g, v, q.x, q.y, rr);
  }
  if (g.data.drop) { const d = g.data.drop, q = grid.toPx(d.c, d.r); disc(ctx, g, d.who, q.x, d.y, rr); }
  ctx.save();
  ctx.beginPath();
  ctx.rect(grid.x - 10, grid.y - 10, grid.w + 20, grid.h + 20);
  for (let r = 0; r < TUNING.rows; r += 1) for (let c = 0; c < TUNING.cols; c += 1) { const q = grid.toPx(c, r); ctx.moveTo(q.x + rr + 2, q.y); ctx.arc(q.x, q.y, rr + 2, 0, Math.PI * 2, true); }
  ctx.fillStyle = g.color("secondary");
  ctx.fill("evenodd");
  ctx.strokeStyle = "rgba(10,8,30,0.6)"; ctx.lineWidth = 3;
  ctx.strokeRect(grid.x - 10, grid.y - 10, grid.w + 20, grid.h + 20);
  ctx.restore();
  if (g.data.win) {
    const a = grid.toPx(g.data.win[0][0], g.data.win[0][1]), z = grid.toPx(g.data.win[3][0], g.data.win[3][1]);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.globalAlpha = 0.7 + Math.sin(g.time * 10) * 0.3;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(z.x, z.y); ctx.stroke(); ctx.globalAlpha = 1;
  }
  g.text(g.data.status, g.W / 2, grid.y + grid.h + 44, { size: 19, color: g.data.turn === YOU ? "text" : "accent", align: "center", font: "display" });
});
