// Recipe: checkers — 8x8 checkers (American rules) against a computer.
// Men move one square diagonally forward, captures are forced, a capture chain
// must be finished, a man reaching the far row is crowned and then moves and
// jumps both ways. You lose when you have no legal move. Tap a piece, then a
// glowing square (a multi-jump goes all the way). Each win raises the AI depth.
const TUNING = { aiDelay: 0.5, captureScore: 20, kingScore: 50, winBonus: 400, depths: [2, 4, 6] };
const THEME = { light: "#f1dfc1", dark: "#7a4e33", select: "rgba(255,226,74,0.55)", last: "rgba(255,214,0,0.3)" };
// Pieces: "r" red man (you), "R" red king, "b" black man (computer), "B" black king.

const g = KULT.game({
  hero: (ctx, g, s) => drawPiece(ctx, g, "R", 0, 0, s * 1.4),
  title: "Crown Jump",
  hint: "Tap your red piece, then a glowing square. Jumps are forced!",
  lives: 0,
  background: { deco: "dots" },
  hud: { level: true }
});

const isRed = (p) => p === "r" || p === "R";
const isKing = (p) => p === "R" || p === "B";
const owner = (p) => (p ? (isRed(p) ? "red" : "black") : null);

function startBoard() {
  const b = new Array(64).fill(null);
  for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) {
    if ((r + c) % 2 === 0) continue;
    if (r < 3) b[r * 8 + c] = "b";
    else if (r > 4) b[r * 8 + c] = "r";
  }
  return b;
}

function dirsFor(p) {
  if (isKing(p)) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  return isRed(p) ? [[-1, 1], [-1, -1]] : [[1, 1], [1, -1]];
}

// Every complete capture chain for the piece on `from` (a list of moves).
function jumpsFrom(b, from, p, path, taken, out) {
  const r = Math.floor(from / 8), c = from % 8;
  let extended = false;
  for (const [dr, dc] of dirsFor(p)) {
    const mr = r + dr, mc = c + dc, lr = r + dr * 2, lc = c + dc * 2;
    if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
    const mid = mr * 8 + mc, land = lr * 8 + lc;
    if (!b[mid] || owner(b[mid]) === owner(p) || taken.includes(mid) || b[land]) continue;
    extended = true;
    const crowned = !isKing(p) && (isRed(p) ? lr === 0 : lr === 7);
    const nb = b.slice(); nb[land] = p; nb[from] = null;
    if (crowned) out.push({ from: path[0], to: land, path: [...path, land], taken: [...taken, mid] });
    else jumpsFrom(nb, land, p, [...path, land], [...taken, mid], out);
  }
  if (!extended && taken.length) out.push({ from: path[0], to: from, path, taken });
}

function movesFor(b, side) {
  const jumps = [], steps = [];
  for (let i = 0; i < 64; i += 1) {
    const p = b[i];
    if (!p || owner(p) !== side) continue;
    jumpsFrom(b, i, p, [i], [], jumps);
    const r = Math.floor(i / 8), c = i % 8;
    for (const [dr, dc] of dirsFor(p)) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      if (!b[nr * 8 + nc]) steps.push({ from: i, to: nr * 8 + nc, path: [i, nr * 8 + nc], taken: [] });
    }
  }
  return jumps.length ? jumps : steps;
}

function apply(b, m) {
  const nb = b.slice();
  let p = nb[m.from];
  nb[m.from] = null;
  for (const t of m.taken) nb[t] = null;
  const row = Math.floor(m.to / 8);
  if (p === "r" && row === 0) p = "R";
  if (p === "b" && row === 7) p = "B";
  nb[m.to] = p;
  return nb;
}

function evaluate(b) {
  let s = 0;
  for (let i = 0; i < 64; i += 1) {
    const p = b[i];
    if (!p) continue;
    const r = Math.floor(i / 8), c = i % 8;
    const centre = c >= 2 && c <= 5 && r >= 2 && r <= 5 ? 6 : 0;
    const v = (isKing(p) ? 170 : 100 + (isRed(p) ? 7 - r : r) * 4) + centre;
    s += isRed(p) ? -v : v;
  }
  return s; // from black's (computer's) point of view
}

function search(b, depth, alpha, beta, side, budget) {
  budget.n += 1;
  const moves = movesFor(b, side);
  if (!moves.length) return side === "black" ? -10000 - depth : 10000 + depth;
  if (depth === 0 || budget.n > budget.max) return evaluate(b);
  if (side === "black") {
    let best = -Infinity;
    for (const m of moves) { best = Math.max(best, search(apply(b, m), depth - 1, alpha, beta, "red", budget)); alpha = Math.max(alpha, best); if (alpha >= beta) break; }
    return best;
  }
  let best = Infinity;
  for (const m of moves) { best = Math.min(best, search(apply(b, m), depth - 1, alpha, beta, "black", budget)); beta = Math.min(beta, best); if (alpha >= beta) break; }
  return best;
}

function aiMove(g) {
  const moves = movesFor(g.data.board, "black");
  if (!moves.length) return null;
  const depth = TUNING.depths[Math.min(TUNING.depths.length - 1, g.level - 1)];
  const noise = Math.max(0, 30 - g.level * 12);
  const budget = { n: 0, max: 80000 };
  let best = moves[0], bestV = -Infinity;
  for (const m of moves) {
    const v = search(apply(g.data.board, m), depth - 1, -Infinity, Infinity, "red", budget) + g.range(-noise, noise) + m.taken.length * 2;
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}

function newGame(g) {
  g.data.board = startBoard();
  g.data.turn = "red";
  g.data.moves = movesFor(g.data.board, "red");
  g.data.sel = -1;
  g.data.targets = [];
  g.data.anim = null;
  g.data.last = null;
  g.data.aiTimer = 0;
  g.data.ended = false;
  g.data.status = "Your move";
}

function play(g, m) {
  const before = g.data.board[m.from];
  const side = owner(before);
  g.data.anim = { piece: before, path: m.path, t: 0 };
  g.data.board = apply(g.data.board, m);
  g.data.last = m;
  g.data.sel = -1; g.data.targets = [];
  const grid = g.data.grid;
  for (const t of m.taken) {
    const q = grid.toPx(t % 8, Math.floor(t / 8));
    g.burst(q.x, q.y, { color: side === "red" ? "good" : "danger", count: 12, speed: 140 });
    if (side === "red") g.addScore(TUNING.captureScore * m.taken.length, q.x, q.y);
  }
  if (m.taken.length) { g.sfx(side === "red" ? "coin" : "hit"); if (side === "black") g.shake(4, 0.16); if (m.taken.length > 1) g.floatText(g.W / 2, grid.y - 14, `${m.taken.length}x JUMP!`, "accent", 22); }
  else g.sfx("click");
  if (!isKing(before) && isKing(g.data.board[m.to])) {
    const q = grid.toPx(m.to % 8, Math.floor(m.to / 8));
    g.floatText(q.x, q.y - 20, "KING!", "accent", 20); g.sfx("power");
    if (side === "red") g.addScore(TUNING.kingScore, q.x, q.y);
  }
  g.data.turn = side === "red" ? "black" : "red";
  g.data.moves = movesFor(g.data.board, g.data.turn);
  if (!g.data.moves.length) {
    g.data.ended = true;
    if (g.data.turn === "black") {
      g.data.status = "You win!";
      g.addScore(TUNING.winBonus * g.level, g.W / 2, grid.y + grid.h / 2);
      g.sfx("win"); g.flash("good", 0.25);
      g.after(1.6, () => { g.nextLevel(); newGame(g); });
    } else {
      g.data.status = "No moves left";
      g.sfx("lose");
      g.after(1.2, () => g.over({ title: "YOU LOST" }));
    }
    return;
  }
  const forced = g.data.moves[0].taken.length > 0;
  g.data.status = g.data.turn === "red" ? (forced ? "You must jump!" : "Your move") : "Computer is thinking…";
  if (g.data.turn === "black") g.data.aiTimer = TUNING.aiDelay + m.path.length * 0.12;
}

g.setup((g) => {
  g.data.grid = g.grid({ cols: 8, rows: 8, offsetY: 0, heightFrac: 0.6 });
  newGame(g);
});

g.update((g, dt) => {
  if (g.data.anim) { g.data.anim.t += dt / (0.16 * (g.data.anim.path.length - 1)); if (g.data.anim.t >= 1) g.data.anim = null; }
  const red = g.data.board.filter((p) => isRed(p)).length, black = g.data.board.filter((p) => p && !isRed(p)).length;
  g.hud.set("You", red);
  g.hud.set("CPU", black);
  if (g.data.ended) return;
  if (g.data.turn === "black") {
    g.data.aiTimer -= dt;
    if (g.data.aiTimer <= 0 && !g.data.anim) { const m = aiMove(g); if (m) play(g, m); }
    return;
  }
  const grid = g.data.grid;
  for (const tap of g.input.taps) {
    const cell = grid.cellAt(tap.x, tap.y);
    if (!cell) { g.data.sel = -1; g.data.targets = []; continue; }
    const i = cell.r * 8 + cell.c;
    const m = g.data.targets.find((t) => t.to === i);
    if (m) { play(g, m); return; }
    if (isRed(g.data.board[i])) {
      g.data.sel = i;
      g.data.targets = g.data.moves.filter((t) => t.from === i);
      if (!g.data.targets.length) { g.shake(2, 0.08); g.sfx("hit"); if (g.data.moves[0].taken.length) g.floatText(g.W / 2, grid.y - 14, "A JUMP IS FORCED", "danger", 16); }
      else g.sfx("pop");
    } else { g.data.sel = -1; g.data.targets = []; }
  }
});

function drawPiece(ctx, g, p, x, y, s) {
  const name = `${isRed(p) ? "red" : "black"}_${isKing(p) ? "king" : "piece"}`;
  if (g.sprite(name, x, y, s * 0.86, s * 0.86)) return;
  const r = s * 0.38;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.25, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
  const base = isRed(p) ? g.color("danger") : "#2b2433";
  ctx.fillStyle = g.shade(base, -0.3);
  ctx.beginPath(); ctx.arc(x, y + 3, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = base;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r * 0.68, 0, Math.PI * 2); ctx.stroke();
  if (isKing(p)) {
    ctx.fillStyle = "#ffd34d";
    ctx.beginPath();
    const w = r * 0.9, h = r * 0.55;
    ctx.moveTo(x - w / 2, y + h / 2); ctx.lineTo(x - w / 2, y - h / 2); ctx.lineTo(x - w / 4, y); ctx.lineTo(x, y - h / 2 - 2); ctx.lineTo(x + w / 4, y); ctx.lineTo(x + w / 2, y - h / 2); ctx.lineTo(x + w / 2, y + h / 2);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

g.draw((ctx, g) => {
  const grid = g.data.grid, s = grid.cell, b = g.data.board;
  g.panel(grid.x - 8, grid.y - 8, grid.w + 16, grid.h + 16, { r: 12 });
  const last = g.data.last;
  for (let i = 0; i < 64; i += 1) {
    const c = i % 8, r = Math.floor(i / 8), x = grid.x + c * s, y = grid.y + r * s;
    ctx.fillStyle = (c + r) % 2 ? THEME.dark : THEME.light;
    ctx.fillRect(x, y, s, s);
    if (last && (last.from === i || last.to === i)) { ctx.fillStyle = THEME.last; ctx.fillRect(x, y, s, s); }
    if (g.data.sel === i) { ctx.fillStyle = THEME.select; ctx.fillRect(x, y, s, s); }
  }
  // Pieces that can move this turn get a soft ring (forced jumps stand out).
  if (g.data.turn === "red" && g.data.sel < 0 && !g.data.ended) {
    const from = new Set(g.data.moves.map((m) => m.from));
    for (const i of from) {
      const q = grid.toPx(i % 8, Math.floor(i / 8));
      ctx.strokeStyle = g.data.moves[0].taken.length ? g.color("accent") : "rgba(255,255,255,0.35)";
      ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + Math.sin(g.time * 5) * 0.3;
      ctx.beginPath(); ctx.arc(q.x, q.y, s * 0.46, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  const anim = g.data.anim;
  for (let i = 0; i < 64; i += 1) {
    if (!b[i] || (anim && anim.path[anim.path.length - 1] === i)) continue;
    const q = grid.toPx(i % 8, Math.floor(i / 8));
    drawPiece(ctx, g, b[i], q.x, q.y + (g.data.sel === i ? -3 : 0), s);
  }
  for (const m of g.data.targets) {
    const q = grid.toPx(m.to % 8, Math.floor(m.to / 8));
    ctx.fillStyle = m.taken.length ? g.color("accent") : "rgba(255,255,255,0.55)";
    ctx.beginPath(); ctx.arc(q.x, q.y, s * 0.16, 0, Math.PI * 2); ctx.fill();
  }
  if (anim) {
    const seg = Math.min(anim.path.length - 2, Math.floor(anim.t * (anim.path.length - 1)));
    const k = Math.min(1, anim.t * (anim.path.length - 1) - seg);
    const a = grid.toPx(anim.path[seg] % 8, Math.floor(anim.path[seg] / 8)), z = grid.toPx(anim.path[seg + 1] % 8, Math.floor(anim.path[seg + 1] / 8));
    drawPiece(ctx, g, anim.piece, a.x + (z.x - a.x) * k, a.y + (z.y - a.y) * k - Math.sin(k * Math.PI) * 10, s);
  }
  g.text(g.data.status, g.W / 2, grid.y + grid.h + 40, { size: 19, color: g.data.turn === "red" ? "text" : "accent", align: "center", font: "display" });
});
