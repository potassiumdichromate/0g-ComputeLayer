// Recipe: chess — real chess against a computer opponent. Full rules: legal
// moves only, check, checkmate, stalemate, castling, en passant, promotion
// (to a queen), 50-move and bare-kings draws. Tap a piece, then a highlighted
// square. Each win starts a new game against a stronger AI (deeper search).
// Pieces use generated art when a full set exists (white_king … black_pawn),
// otherwise crisp chess glyphs. Retheme via THEME and TUNING.
const TUNING = { aiDelay: 0.45, winBonus: 500, captureScore: 10, maxDepth: 3 };
const THEME = { light: "#eedbb8", dark: "#a8764e", select: "rgba(255,226,74,0.6)", last: "rgba(255,214,0,0.32)", check: "rgba(255,40,40,0.75)" };
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const NAMES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
// Piece-square bonuses from White's side (row 0 = rank 8).
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20]
};
const START = "rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR";
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const g = KULT.game({
  hero: (ctx, g, s) => drawPiece(ctx, g, "K", 0, 0, s * 1.25),
  title: "Royal Gambit",
  hint: "Tap a piece, then a glowing square. Checkmate the computer to climb a level.",
  lives: 0,
  background: { deco: "dots" },
  hud: { level: true }
});

// ------------------------------------------------------------ rules
const isWhite = (p) => p != null && p === p.toUpperCase();
const kind = (p) => p.toLowerCase();
const sq = (c, r) => r * 8 + c;
const onBoard = (c, r) => c >= 0 && c < 8 && r >= 0 && r < 8;

function newPosition() {
  return { b: [...START].map((ch) => (ch === "." ? null : ch)), white: true, castle: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0 };
}

function attacked(b, target, byWhite) {
  const tc = target % 8, tr = Math.floor(target / 8);
  const pr = byWhite ? tr + 1 : tr - 1;
  for (const dc of [-1, 1]) {
    if (onBoard(tc + dc, pr)) { const p = b[sq(tc + dc, pr)]; if (p && isWhite(p) === byWhite && kind(p) === "p") return true; }
  }
  for (const [dc, dr] of KNIGHT) {
    if (!onBoard(tc + dc, tr + dr)) continue;
    const p = b[sq(tc + dc, tr + dr)];
    if (p && isWhite(p) === byWhite && kind(p) === "n") return true;
  }
  for (const [dc, dr] of KING) {
    if (!onBoard(tc + dc, tr + dr)) continue;
    const p = b[sq(tc + dc, tr + dr)];
    if (p && isWhite(p) === byWhite && kind(p) === "k") return true;
  }
  for (const [dirs, kinds] of [[ROOK_DIRS, "rq"], [BISHOP_DIRS, "bq"]]) {
    for (const [dc, dr] of dirs) {
      let c = tc + dc, r = tr + dr;
      while (onBoard(c, r)) {
        const p = b[sq(c, r)];
        if (p) { if (isWhite(p) === byWhite && kinds.includes(kind(p))) return true; break; }
        c += dc; r += dr;
      }
    }
  }
  return false;
}

function kingSquare(b, white) {
  const k = white ? "K" : "k";
  return b.indexOf(k);
}

function inCheck(pos, white) {
  const k = kingSquare(pos.b, white);
  return k >= 0 && attacked(pos.b, k, !white);
}

function pseudoMoves(pos) {
  const out = [], b = pos.b, w = pos.white;
  const add = (from, to, extra) => out.push(Object.assign({ from, to, capture: b[to] }, extra));
  for (let i = 0; i < 64; i += 1) {
    const p = b[i];
    if (!p || isWhite(p) !== w) continue;
    const c = i % 8, r = Math.floor(i / 8), k = kind(p);
    if (k === "p") {
      const dir = w ? -1 : 1, startRow = w ? 6 : 1, lastRow = w ? 0 : 7;
      const one = sq(c, r + dir);
      if (onBoard(c, r + dir) && !b[one]) {
        add(i, one, r + dir === lastRow ? { promo: w ? "Q" : "q" } : null);
        const two = sq(c, r + dir * 2);
        if (r === startRow && !b[two]) add(i, two, { double: true });
      }
      for (const dc of [-1, 1]) {
        if (!onBoard(c + dc, r + dir)) continue;
        const t = sq(c + dc, r + dir);
        if (b[t] && isWhite(b[t]) !== w) add(i, t, r + dir === lastRow ? { promo: w ? "Q" : "q" } : null);
        else if (t === pos.ep) out.push({ from: i, to: t, enPassant: sq(c + dc, r), capture: b[sq(c + dc, r)] });
      }
    } else if (k === "n" || k === "k") {
      for (const [dc, dr] of k === "n" ? KNIGHT : KING) {
        if (!onBoard(c + dc, r + dr)) continue;
        const t = sq(c + dc, r + dr);
        if (!b[t] || isWhite(b[t]) !== w) add(i, t);
      }
      if (k === "k") {
        const home = w ? 60 : 4;
        if (i === home && !attacked(b, home, !w)) {
          if (pos.castle[w ? "K" : "k"] && !b[home + 1] && !b[home + 2] && b[home + 3] === (w ? "R" : "r") && !attacked(b, home + 1, !w)) add(i, home + 2, { castle: [home + 3, home + 1] });
          if (pos.castle[w ? "Q" : "q"] && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === (w ? "R" : "r") && !attacked(b, home - 1, !w)) add(i, home - 2, { castle: [home - 4, home - 1] });
        }
      }
    } else {
      const dirs = k === "r" ? ROOK_DIRS : k === "b" ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
      for (const [dc, dr] of dirs) {
        let cc = c + dc, rr = r + dr;
        while (onBoard(cc, rr)) {
          const t = sq(cc, rr);
          if (b[t]) { if (isWhite(b[t]) !== w) add(i, t); break; }
          add(i, t);
          cc += dc; rr += dr;
        }
      }
    }
  }
  return out;
}

function makeMove(pos, m) {
  const b = pos.b.slice();
  const p = b[m.from];
  b[m.to] = m.promo || p;
  b[m.from] = null;
  if (m.enPassant != null) b[m.enPassant] = null;
  if (m.castle) { b[m.castle[1]] = b[m.castle[0]]; b[m.castle[0]] = null; }
  const castle = Object.assign({}, pos.castle);
  if (p === "K") { castle.K = false; castle.Q = false; }
  if (p === "k") { castle.k = false; castle.q = false; }
  for (const [s, key] of [[63, "K"], [56, "Q"], [7, "k"], [0, "q"]]) if (m.from === s || m.to === s) castle[key] = false;
  const ep = m.double ? (m.from + m.to) / 2 : -1;
  const half = kind(p) === "p" || m.capture ? 0 : pos.half + 1;
  return { b, white: !pos.white, castle, ep, half };
}

function legalMoves(pos) {
  return pseudoMoves(pos).filter((m) => !inCheck(makeMove(pos, m), pos.white));
}

function bareKings(b) {
  return b.every((p) => !p || kind(p) === "k" || ((kind(p) === "n" || kind(p) === "b") && b.filter(Boolean).length === 3));
}

// ------------------------------------------------------------ computer player
function evaluate(pos) {
  let s = 0;
  for (let i = 0; i < 64; i += 1) {
    const p = pos.b[i];
    if (!p) continue;
    const k = kind(p);
    if (isWhite(p)) s += VALUE[k] + PST[k][i];
    else s -= VALUE[k] + PST[k][(7 - Math.floor(i / 8)) * 8 + (i % 8)];
  }
  return pos.white ? s : -s;
}

function ordered(moves) {
  return moves.sort((a, b) => (b.capture ? VALUE[kind(b.capture)] * 10 - 1 : 0) + (b.promo ? 800 : 0) - ((a.capture ? VALUE[kind(a.capture)] * 10 - 1 : 0) + (a.promo ? 800 : 0)));
}

function search(pos, depth, alpha, beta, ply, budget) {
  budget.nodes += 1;
  if (depth === 0 || budget.nodes > budget.max) return evaluate(pos);
  const moves = legalMoves(pos);
  if (!moves.length) return inCheck(pos, pos.white) ? -100000 + ply : 0;
  if (pos.half >= 100) return 0;
  for (const m of ordered(moves)) {
    const v = -search(makeMove(pos, m), depth - 1, -beta, -alpha, ply + 1, budget);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function chooseMove(g, pos) {
  const moves = ordered(legalMoves(pos));
  if (!moves.length) return null;
  const depth = Math.min(TUNING.maxDepth, g.level);
  const noise = Math.max(0, 60 - g.level * 25);
  const budget = { nodes: 0, max: 60000 };
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const v = -search(makeMove(pos, m), depth - 1, -Infinity, Infinity, 1, budget) + g.range(-noise, noise);
    if (v > bestScore) { bestScore = v; best = m; }
  }
  return best;
}

// ------------------------------------------------------------ game flow
function newGame(g) {
  g.data.pos = newPosition();
  g.data.legal = legalMoves(g.data.pos);
  g.data.sel = -1;
  g.data.targets = [];
  g.data.last = null;
  g.data.anim = null;
  g.data.history = [];
  g.data.captured = { white: [], black: [] };
  g.data.aiTimer = 0;
  g.data.ended = false;
  g.data.status = "Your move";
}

function pieceSpriteName(p) {
  return `${isWhite(p) ? "white" : "black"}_${NAMES[kind(p)]}`;
}

function play(g, m) {
  const pos = g.data.pos;
  const piece = pos.b[m.from];
  g.data.anim = { piece: m.promo || piece, from: m.from, to: m.to, t: 0 };
  g.data.pos = makeMove(pos, m);
  g.data.last = { from: m.from, to: m.to };
  g.data.sel = -1;
  g.data.targets = [];
  const grid = g.data.grid;
  const at = grid.toPx(m.to % 8, Math.floor(m.to / 8));
  if (m.capture) {
    (isWhite(m.capture) ? g.data.captured.black : g.data.captured.white).push(m.capture);
    g.burst(at.x, at.y, { color: isWhite(piece) ? "good" : "danger", count: 14, speed: 150 });
    if (isWhite(piece)) g.addScore(Math.round(VALUE[kind(m.capture)] / 100) * TUNING.captureScore, at.x, at.y - 10);
    else g.shake(4, 0.18);
    g.sfx(isWhite(piece) ? "coin" : "hit");
  } else g.sfx(m.castle ? "power" : "click");
  if (m.promo) { g.floatText(at.x, at.y - 18, "QUEEN!", "accent", 20); g.sfx("power"); }
  afterMove(g);
}

function afterMove(g) {
  const pos = g.data.pos;
  g.data.legal = legalMoves(pos);
  const check = inCheck(pos, pos.white);
  if (!g.data.legal.length) {
    g.data.ended = true;
    if (check && !pos.white) {
      g.data.status = "Checkmate! You win";
      g.addScore(TUNING.winBonus * g.level, g.W / 2, g.data.grid.y + g.data.grid.h / 2);
      g.sfx("win"); g.flash("good", 0.25);
      g.after(1.6, () => { g.nextLevel(); newGame(g); });
    } else if (check) {
      g.data.status = "Checkmate";
      g.sfx("lose");
      g.after(1.2, () => g.over({ title: "CHECKMATE" }));
    } else {
      g.data.status = "Stalemate";
      g.after(1.2, () => g.over({ title: "STALEMATE" }));
    }
    return;
  }
  if (pos.half >= 100 || bareKings(pos.b)) {
    g.data.ended = true;
    g.data.status = "Draw";
    g.after(1.2, () => g.over({ title: "DRAW" }));
    return;
  }
  if (check) { g.data.status = pos.white ? "Check! Protect your king" : "Check!"; g.sfx("hit"); }
  else g.data.status = pos.white ? "Your move" : "Computer is thinking…";
  if (!pos.white) g.data.aiTimer = TUNING.aiDelay;
}

function undo(g) {
  const prev = g.data.history.pop();
  if (!prev) return;
  g.data.pos = prev.pos;
  g.data.captured = prev.captured;
  g.data.last = prev.last;
  g.data.legal = legalMoves(g.data.pos);
  g.data.sel = -1; g.data.targets = []; g.data.anim = null; g.data.aiTimer = 0;
  g.data.status = "Your move";
  g.sfx("click");
}

g.setup((g) => {
  g.data.grid = g.grid({ cols: 8, rows: 8, gap: 0, offsetY: 4, heightFrac: 0.6 });
  const all = ["white", "black"].every((side) => Object.values(NAMES).every((n) => g.hasSprite(`${side}_${n}`)));
  g.data.art = all;
  newGame(g);
});

g.update((g, dt) => {
  const grid = g.data.grid;
  if (g.data.anim) { g.data.anim.t += dt / 0.18; if (g.data.anim.t >= 1) g.data.anim = null; }
  g.hud.set("Opponent", `CPU ${Math.min(TUNING.maxDepth, g.level)}`);
  if (g.data.ended) return;
  const pos = g.data.pos;

  if (!pos.white) {
    g.data.aiTimer -= dt;
    if (g.data.aiTimer <= 0 && !g.data.anim) {
      const m = chooseMove(g, pos);
      if (m) play(g, m);
    }
    return;
  }

  if (g.input.button === "undo") { undo(g); return; }
  for (const tap of g.input.taps) {
    const cell = grid.cellAt(tap.x, tap.y);
    if (!cell) { g.data.sel = -1; g.data.targets = []; continue; }
    const i = sq(cell.c, cell.r);
    const move = g.data.targets.find((m) => m.to === i);
    if (move) {
      g.data.history.push({ pos, captured: { white: g.data.captured.white.slice(), black: g.data.captured.black.slice() }, last: g.data.last });
      play(g, move);
      return;
    }
    const p = pos.b[i];
    if (p && isWhite(p)) {
      g.data.sel = i;
      g.data.targets = g.data.legal.filter((m) => m.from === i);
      g.sfx(g.data.targets.length ? "pop" : "click");
      if (!g.data.targets.length) g.shake(2, 0.08);
    } else { g.data.sel = -1; g.data.targets = []; }
  }
});

// ------------------------------------------------------------ drawing
function drawPiece(ctx, g, p, x, y, s) {
  if (g.data.art && g.sprite(pieceSpriteName(p), x, y, s * 0.9, s * 0.9)) return;
  ctx.save();
  ctx.font = `${Math.round(s * 0.84)}px "Segoe UI Symbol","Noto Sans Symbols 2","Noto Sans Symbols","DejaVu Sans","Apple Symbols",serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const ch = GLYPH[kind(p)] + "︎";
  const white = isWhite(p);
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, s * 0.075);
  ctx.strokeStyle = white ? "#2a2238" : "#f6efe0";
  ctx.strokeText(ch, x, y + s * 0.04);
  ctx.fillStyle = white ? "#fffaf0" : "#221b2e";
  ctx.fillText(ch, x, y + s * 0.04);
  ctx.restore();
}

function drawTray(ctx, g, pieces, y) {
  const s = 22;
  pieces.slice().sort((a, b) => VALUE[kind(b)] - VALUE[kind(a)]).forEach((p, i) => drawPiece(ctx, g, p, g.W / 2 - 150 + (i % 15) * 20, y + Math.floor(i / 15) * 20, s));
}

g.draw((ctx, g) => {
  const grid = g.data.grid, s = grid.cell, pos = g.data.pos;
  g.panel(grid.x - 8, grid.y - 8, grid.w + 16, grid.h + 16, { r: 12 });
  for (let i = 0; i < 64; i += 1) {
    const c = i % 8, r = Math.floor(i / 8), x = grid.x + c * s, y = grid.y + r * s;
    ctx.fillStyle = (c + r) % 2 ? THEME.dark : THEME.light;
    ctx.fillRect(x, y, s, s);
    if (g.data.last && (g.data.last.from === i || g.data.last.to === i)) { ctx.fillStyle = THEME.last; ctx.fillRect(x, y, s, s); }
    if (g.data.sel === i) { ctx.fillStyle = THEME.select; ctx.fillRect(x, y, s, s); }
  }
  // Coordinates along the edges.
  ctx.font = `600 9px sans-serif`; ctx.textBaseline = "alphabetic";
  for (let k = 0; k < 8; k += 1) {
    ctx.fillStyle = k % 2 ? THEME.light : THEME.dark;
    ctx.textAlign = "left"; ctx.fillText(String(8 - k), grid.x + 2, grid.y + k * s + 10);
    ctx.fillStyle = k % 2 ? THEME.dark : THEME.light;
    ctx.textAlign = "right"; ctx.fillText("abcdefgh"[k], grid.x + (k + 1) * s - 2, grid.y + 8 * s - 3);
  }
  // King in check glows red.
  if (inCheck(pos, pos.white)) {
    const k = kingSquare(pos.b, pos.white), q = grid.toPx(k % 8, Math.floor(k / 8));
    const glow = ctx.createRadialGradient(q.x, q.y, 2, q.x, q.y, s * 0.7);
    glow.addColorStop(0, THEME.check); glow.addColorStop(1, "rgba(255,40,40,0)");
    ctx.fillStyle = glow; ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
  }
  const anim = g.data.anim;
  for (let i = 0; i < 64; i += 1) {
    const p = pos.b[i];
    if (!p || (anim && anim.to === i)) continue;
    const q = grid.toPx(i % 8, Math.floor(i / 8));
    const lift = g.data.sel === i ? -3 + Math.sin(g.time * 8) * 1.5 : 0;
    drawPiece(ctx, g, p, q.x, q.y + lift, s);
  }
  for (const m of g.data.targets) {
    const q = grid.toPx(m.to % 8, Math.floor(m.to / 8));
    ctx.fillStyle = "rgba(20,16,40,0.35)";
    ctx.beginPath();
    if (m.capture) { ctx.lineWidth = 4; ctx.strokeStyle = "rgba(20,16,40,0.45)"; ctx.arc(q.x, q.y, s * 0.44, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.arc(q.x, q.y, s * 0.15, 0, Math.PI * 2); ctx.fill(); }
  }
  if (anim) {
    const a = grid.toPx(anim.from % 8, Math.floor(anim.from / 8)), b = grid.toPx(anim.to % 8, Math.floor(anim.to / 8));
    const t = KULT.EASE && KULT.EASE.out ? KULT.EASE.out(Math.min(1, anim.t)) : Math.min(1, anim.t);
    drawPiece(ctx, g, anim.piece, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 6, s);
  }

  const top = grid.y - 20, bottom = grid.y + grid.h + 22;
  drawTray(ctx, g, g.data.captured.white, top - 4);
  drawTray(ctx, g, g.data.captured.black, bottom);
  g.text(g.data.status, g.W / 2, bottom + 34, { size: 18, color: pos.white ? "text" : "accent", align: "center", font: "display" });
  g.button("undo", { x: g.W / 2, y: bottom + 82, w: 140, h: 44, label: "UNDO", icon: "restart", color: "secondary", size: 17, disabled: !g.data.history.length || !pos.white || g.data.ended });
});
