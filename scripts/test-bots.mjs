// Scripted bots that play the board, puzzle and turn-based recipes properly
// (real moves, not random taps) through whole games: wins, losses, level-ups
// and the computer opponent's replies. Complements `npm run test:recipes`,
// whose random-tap player barely touches these games.
//
//   node scripts/test-bots.mjs [recipeId]
import { recipeCode } from "../recipes/index.js";
import { loadHeadless } from "../src/qa/smoke.js";

function harness(id, seed = 7) {
  const h = loadHeadless(recipeCode(id), { gamePackage: { title: id }, seed });
  const T = h.test, g = h.game;
  const call = (expr) => h.run(`__KULT_TEST__.${expr}`, 8000);
  call("boot()"); call("step(2)"); call("start()"); call("step(10)");
  const tapAt = (x, y) => { call(`tap(${x}, ${y})`); call("step(3)"); };
  const tapCell = (grid, c, r) => { const q = grid.toPx(c, r); tapAt(q.x, q.y); };
  return { h, T, g, call, tapAt, tapCell, frames: (n) => call(`step(${n})`) };
}

const BOTS = {
  chess(b) {
    let plies = 0;
    for (let i = 0; i < 600 && b.T().state === "play"; i += 1) {
      const d = b.g().data;
      if (d.pos.white && !d.ended && !d.anim && d.legal.length) {
        const caps = d.legal.filter((m) => m.capture);
        const m = caps.length && Math.random() < 0.7 ? caps[0] : d.legal[Math.floor(Math.random() * d.legal.length)];
        b.tapCell(d.grid, m.from % 8, Math.floor(m.from / 8));
        b.tapCell(d.grid, m.to % 8, Math.floor(m.to / 8));
        plies += 1;
      }
      b.frames(40);
      if (plies > 150) break;
    }
    return `plies=${plies}`;
  },
  checkers(b) {
    let plies = 0;
    for (let i = 0; i < 600 && b.T().state === "play"; i += 1) {
      const d = b.g().data;
      if (d.turn === "red" && !d.ended && !d.anim && d.moves.length) {
        const m = d.moves[Math.floor(Math.random() * d.moves.length)];
        b.tapCell(d.grid, m.from % 8, Math.floor(m.from / 8));
        b.tapCell(d.grid, m.to % 8, Math.floor(m.to / 8));
        plies += 1;
      }
      b.frames(50);
      if (plies > 150) break;
    }
    return `plies=${plies}`;
  },
  connect4(b) {
    for (let i = 0; i < 400 && b.T().state === "play"; i += 1) {
      const d = b.g().data;
      if (d.turn === 1 && !d.over && !d.drop) b.tapCell(d.grid, Math.floor(Math.random() * 7), 2);
      b.frames(30);
    }
    return "";
  },
  tictactoe(b) {
    for (let i = 0; i < 400 && b.T().state === "play"; i += 1) {
      const d = b.g().data;
      if (d.turn === "X" && !d.done) { const free = d.board.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0); const k = free[Math.floor(Math.random() * free.length)]; b.tapCell(d.grid, k % 3, Math.floor(k / 3)); }
      b.frames(30);
    }
    return "";
  },
  memory(b) {
    for (let i = 0; i < 300 && b.T().state === "play" && b.T().level < 4; i += 1) {
      const d = b.g().data;
      if (!d.cleared && d.wait <= 0 && d.open.length === 0) {
        const left = d.cards.map((c, k) => ({ c, k })).filter((x) => !x.c.done);
        if (left.length) {
          const a = left[0], z = Math.random() < 0.7 ? left.find((x) => x.k !== a.k && x.c.item === a.c.item) : left[left.length - 1];
          for (const x of [a, z]) b.tapCell(d.grid, x.k % d.grid.cols, Math.floor(x.k / d.grid.cols));
        }
      }
      b.frames(20);
    }
    return "";
  },
  minesweeper(b) {
    let first = true;
    for (let i = 0; i < 500 && b.T().state === "play" && b.T().level < 3; i += 1) {
      const d = b.g().data;
      if (!d.ended) {
        const cols = d.grid.cols;
        const closed = d.cells.map((c, k) => ({ c, k })).filter((x) => !x.c.open && !x.c.flag && (first || !x.c.mine || Math.random() < 0.01));
        if (closed.length) { const x = closed[Math.floor(Math.random() * closed.length)]; b.tapCell(d.grid, x.k % cols, Math.floor(x.k / cols)); first = false; }
      }
      b.frames(10);
      if (b.g().data !== d) first = true;
    }
    return "";
  },
  snake(b) {
    for (let i = 0; i < 2000 && b.T().state === "play"; i += 1) {
      const d = b.g().data;
      if (d.dead) { b.frames(10); continue; }
      const h = d.body[0], f = d.food;
      let want = f.c > h.c ? "right" : f.c < h.c ? "left" : f.r > h.r ? "down" : "up";
      const v = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }[want];
      if (v[0] === -d.dir[0] && v[1] === -d.dir[1]) want = d.dir[0] ? (h.r > 10 ? "up" : "down") : (h.c > 7 ? "left" : "right");
      b.call(`swipe('${want}')`);
      b.frames(4);
      if (b.T().score > 400) break;
    }
    return `len=${b.g().data.body.length}`;
  },
  blocks(b) {
    const moves = ["left", "right", "up", "down", "left", "right"];
    for (let i = 0; i < 1500 && b.T().state === "play"; i += 1) {
      b.call(`swipe('${moves[Math.floor(Math.random() * moves.length)]}')`);
      b.frames(6);
    }
    return `lines=${b.g().data.lines}`;
  },
  wordguess(b) {
    for (let i = 0; i < 400 && b.T().state === "play"; i += 1) {
      const d = b.g().data;
      if (!d.done) {
        const word = Math.random() < 0.3 ? d.answer : "CRANE";
        for (const ch of word) { b.call(`key('Key${ch}')`); b.frames(1); b.call(`keyUp('Key${ch}')`); }
        b.call("key('Enter')"); b.frames(1); b.call("keyUp('Enter')");
      }
      b.frames(40);
    }
    return "";
  }
};

const only = process.argv[2];
let failed = 0;
for (const [id, bot] of Object.entries(BOTS)) {
  if (only && id !== only) continue;
  const started = Date.now();
  let note = "", crash = null;
  const b = harness(id);
  try { note = bot(b); } catch (e) { crash = e.message; }
  const errors = b.T()?.errors ?? [];
  const ok = !crash && !errors.length;
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${id.padEnd(12)} state=${b.T().state} score=${b.T().score} level=${b.T().level} ${note} ${Date.now() - started}ms`);
  if (crash) console.log("   ✗ crash:", crash);
  for (const e of errors.slice(0, 5)) console.log("   ✗", e);
}
process.exit(failed ? 1 : 0);
