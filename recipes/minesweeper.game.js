// Recipe: minesweeper — tap to reveal, numbers count the mines around a cell,
// empty areas open up by themselves, the first tap is always safe. Switch to
// FLAG mode (or long-press) to mark mines. Clear every safe cell to win and
// face a bigger field; hitting a mine ends the run.
const TUNING = { fields: [[8, 10, 10], [9, 12, 18], [10, 13, 26], [10, 14, 34]], reveal: 2, clear: 300, holdFlag: 0.42 };
const NUM_COLORS = ["", "#4fa3ff", "#4fd46b", "#ff5a5a", "#a46bff", "#ff9b3d", "#3dd6d0", "#ffffff", "#bbbbbb"];

const g = KULT.game({
  hero: false,
  title: "Mine Field",
  hint: "Tap to dig, long-press or FLAG mode to mark a mine. Clear every safe cell!",
  lives: 0,
  background: { deco: "dots" },
  hud: { level: true }
});

function layout(g) {
  const i = Math.min(TUNING.fields.length - 1, g.level - 1);
  const [cols, rows, mines] = TUNING.fields[i];
  g.data.grid = g.grid({ cols, rows, gap: 2, offsetY: -6, heightFrac: 0.64 });
  g.data.cells = new Array(cols * rows).fill(null).map(() => ({ mine: false, open: false, flag: false, n: 0, t: 0 }));
  g.data.mines = mines;
  g.data.armed = false;
  g.data.ended = false;
  g.data.flagMode = false;
  g.data.pressT = 0;
  g.data.pressCell = null;
  g.data.longDone = false;
}

function neighbors(g, c, r) {
  const out = [];
  for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) if ((dc || dr) && g.data.grid.inside(c + dc, r + dr)) out.push({ c: c + dc, r: r + dr });
  return out;
}
const cellOf = (g, c, r) => g.data.cells[r * g.data.grid.cols + c];

function arm(g, safeC, safeR) {
  const grid = g.data.grid;
  const safe = new Set([safeC + "," + safeR, ...neighbors(g, safeC, safeR).map((q) => q.c + "," + q.r)]);
  const spots = [];
  grid.each((v, c, r) => { if (!safe.has(c + "," + r)) spots.push({ c, r }); });
  for (let k = 0; k < g.data.mines && spots.length; k += 1) {
    const q = spots.splice(g.randInt(0, spots.length - 1), 1)[0];
    cellOf(g, q.c, q.r).mine = true;
  }
  grid.each((v, c, r) => { cellOf(g, c, r).n = neighbors(g, c, r).filter((q) => cellOf(g, q.c, q.r).mine).length; });
  g.data.armed = true;
}

function reveal(g, c, r) {
  const start = cellOf(g, c, r);
  if (start.open || start.flag) return;
  if (!g.data.armed) arm(g, c, r);
  if (start.mine) { boom(g, c, r); return; }
  const stack = [{ c, r }];
  let opened = 0;
  while (stack.length) {
    const q = stack.pop(), cell = cellOf(g, q.c, q.r);
    if (cell.open || cell.flag) continue;
    cell.open = true; cell.t = opened * 0.012; opened += 1;
    if (cell.n === 0) for (const nb of neighbors(g, q.c, q.r)) if (!cellOf(g, nb.c, nb.r).open) stack.push(nb);
  }
  const p = g.data.grid.toPx(c, r);
  g.addScore(opened * TUNING.reveal, p.x, p.y);
  g.sfx(opened > 6 ? "power" : "pop");
  if (opened > 6) g.burst(p.x, p.y, { color: "accent", count: 12, speed: 160 });
  if (g.data.cells.every((k) => k.mine || k.open)) {
    g.data.ended = true;
    g.addScore(TUNING.clear * g.level, g.W / 2, g.data.grid.y + g.data.grid.h / 2);
    g.floatText(g.W / 2, g.data.grid.y - 16, "FIELD CLEARED!", "good", 24);
    g.sfx("win"); g.flash("good", 0.2);
    g.after(1.6, () => { g.nextLevel(); layout(g); });
  }
}

function boom(g, c, r) {
  g.data.ended = true;
  for (const k of g.data.cells) if (k.mine) k.open = true;
  const p = g.data.grid.toPx(c, r);
  g.data.blast = { c, r };
  g.burst(p.x, p.y, { color: "danger", count: 40, speed: 260 });
  g.shake(10, 0.4); g.flash("danger", 0.35); g.sfx("explode");
  g.after(1.2, () => g.over({ title: "BOOM!" }));
}

function toggleFlag(g, c, r) {
  const cell = cellOf(g, c, r);
  if (cell.open) return;
  cell.flag = !cell.flag;
  g.sfx("click");
}

g.setup((g) => { layout(g); g.data.blast = null; });

g.update((g, dt) => {
  const grid = g.data.grid;
  const flags = g.data.cells.filter((k) => k.flag).length;
  g.hud.set("Mines", g.data.mines - flags);
  if (g.data.ended) return;
  if (g.input.button === "flag") { g.data.flagMode = !g.data.flagMode; g.sfx("click"); return; }
  // Long-press flags a cell.
  if (g.input.pressed) { g.data.pressCell = grid.cellAt(g.input.x, g.input.y); g.data.pressT = 0; g.data.longDone = false; }
  if (g.input.held && g.data.pressCell && !g.data.longDone) {
    g.data.pressT += dt;
    if (g.data.pressT >= TUNING.holdFlag) { toggleFlag(g, g.data.pressCell.c, g.data.pressCell.r); g.data.longDone = true; }
  }
  for (const tap of g.input.taps) {
    if (g.data.longDone) { g.data.longDone = false; continue; }
    const cell = grid.cellAt(tap.x, tap.y);
    if (!cell) continue;
    if (g.data.flagMode) toggleFlag(g, cell.c, cell.r);
    else reveal(g, cell.c, cell.r);
    if (g.data.ended) return;
  }
});

g.draw((ctx, g) => {
  const grid = g.data.grid, s = grid.cell;
  g.panel(grid.x - 6, grid.y - 6, grid.w + 12, grid.h + 12, { r: 12 });
  grid.each((v, c, r) => {
    const cell = cellOf(g, c, r), q = grid.toPx(c, r), x = q.x - s / 2, y = q.y - s / 2;
    if (!cell.open) {
      ctx.fillStyle = g.shade(g.color("secondary"), (c + r) % 2 ? -0.05 : 0.05);
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(x, y, s, 3);
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(x, y + s - 3, s, 3);
      if (cell.flag && !g.sprite("flag", q.x, q.y, s * 0.8, s * 0.8)) {
        ctx.fillStyle = "#2b2433"; ctx.fillRect(q.x - 1, q.y - s * 0.3, 2.5, s * 0.6);
        ctx.fillStyle = g.color("danger");
        ctx.beginPath(); ctx.moveTo(q.x + 1, q.y - s * 0.3); ctx.lineTo(q.x + s * 0.3, q.y - s * 0.16); ctx.lineTo(q.x + 1, q.y - s * 0.02); ctx.fill();
      }
      return;
    }
    ctx.fillStyle = (c + r) % 2 ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.15)";
    ctx.fillRect(x, y, s, s);
    if (cell.mine) {
      const blast = g.data.blast && g.data.blast.c === c && g.data.blast.r === r;
      if (blast) { ctx.fillStyle = g.color("danger"); ctx.fillRect(x, y, s, s); }
      if (!g.sprite("mine", q.x, q.y, s * 0.8, s * 0.8)) {
        ctx.fillStyle = "#1b1528"; ctx.beginPath(); ctx.arc(q.x, q.y, s * 0.26, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#1b1528"; ctx.lineWidth = 2.5;
        for (let a = 0; a < 4; a += 1) { const ang = (a * Math.PI) / 4; ctx.beginPath(); ctx.moveTo(q.x - Math.cos(ang) * s * 0.38, q.y - Math.sin(ang) * s * 0.38); ctx.lineTo(q.x + Math.cos(ang) * s * 0.38, q.y + Math.sin(ang) * s * 0.38); ctx.stroke(); }
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(q.x - s * 0.08, q.y - s * 0.08, s * 0.06, 0, Math.PI * 2); ctx.fill();
      }
    } else if (cell.n) {
      ctx.font = `800 ${Math.round(s * 0.58)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = NUM_COLORS[cell.n]; ctx.fillText(String(cell.n), q.x, q.y + 1);
    }
  });
  const y = grid.y + grid.h + 40;
  g.button("flag", { x: g.W / 2, y, w: 180, h: 46, label: g.data.flagMode ? "FLAG MODE: ON" : "FLAG MODE: OFF", color: g.data.flagMode ? "danger" : "secondary", size: 16 });
});
