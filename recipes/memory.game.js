// Recipe: memory — flip two cards at a time to find matching pairs. Matches
// stay face up, misses flip back. Clear the board before the timer runs out;
// fast clears and match streaks score more; every level adds cards. Card faces
// use generated art named card_<item> when it exists, otherwise emoji.
const TUNING = { boards: [[4, 4], [4, 5], [5, 6], [6, 6]], time: [60, 75, 95, 120], match: 50, timeBonus: 5, peek: 0.75 };
const ITEMS = ["apple", "lemon", "grapes", "melon", "cherry", "kiwi", "peach", "pineapple", "coconut", "strawberry", "banana", "carrot", "corn", "mushroom", "pepper", "avocado", "broccoli", "cookie"];
const EMOJI = { apple: "🍎", lemon: "🍋", grapes: "🍇", melon: "🍉", cherry: "🍒", kiwi: "🥝", peach: "🍑", pineapple: "🍍", coconut: "🥥", strawberry: "🍓", banana: "🍌", carrot: "🥕", corn: "🌽", mushroom: "🍄", pepper: "🌶️", avocado: "🥑", broccoli: "🥦", cookie: "🍪" };

const g = KULT.game({
  hero: false,
  title: "Flip Match",
  hint: "Tap two cards to flip them. Find every pair before time runs out!",
  lives: 0,
  background: { deco: "bubbles" },
  hud: { level: true }
});

function deal(g) {
  const i = Math.min(TUNING.boards.length - 1, g.level - 1);
  const [cols, rows] = TUNING.boards[i];
  const pairs = (cols * rows) / 2;
  const items = ITEMS.slice().sort(() => g.rand() - 0.5).slice(0, pairs);
  const deck = items.concat(items).sort(() => g.rand() - 0.5);
  g.data.grid = g.grid({ cols, rows, gap: 8, offsetY: 10, heightFrac: 0.64 });
  g.data.cards = deck.map((item) => ({ item, up: false, done: false, flip: 0 }));
  g.data.open = [];
  g.data.wait = 0;
  g.data.timeLeft = TUNING.time[i];
  g.data.moves = 0;
  g.data.streak = 0;
  g.data.cleared = false;
}

g.setup((g) => deal(g));

g.update((g, dt) => {
  const cards = g.data.cards;
  for (const c of cards) c.flip += ((c.up || c.done ? 1 : 0) - c.flip) * Math.min(1, dt * 14);
  g.hud.set("Time", Math.ceil(g.data.timeLeft));
  g.hud.set("Moves", g.data.moves);
  if (g.data.cleared) return;
  g.data.timeLeft -= dt;
  if (g.data.timeLeft <= 0) { g.data.timeLeft = 0; g.sfx("lose"); g.over({ title: "TIME'S UP!" }); return; }
  if (g.data.wait > 0) {
    g.data.wait -= dt;
    if (g.data.wait <= 0) { for (const k of g.data.open) cards[k].up = false; g.data.open = []; }
    return;
  }
  const grid = g.data.grid;
  for (const tap of g.input.taps) {
    const cell = grid.cellAt(tap.x, tap.y);
    if (!cell) continue;
    const k = cell.r * grid.cols + cell.c;
    const card = cards[k];
    if (!card || card.up || card.done || g.data.open.length >= 2) continue;
    card.up = true;
    g.data.open.push(k);
    g.sfx("click");
    if (g.data.open.length === 2) {
      g.data.moves += 1;
      const [a, b] = g.data.open;
      if (cards[a].item === cards[b].item) {
        cards[a].done = cards[b].done = true;
        g.data.streak += 1;
        g.data.open = [];
        const q = grid.toPx(cell.c, cell.r);
        g.addScore(TUNING.match * g.data.streak, q.x, q.y, { combo: g.data.streak > 1 });
        g.burst(q.x, q.y, { color: "good", count: 12, speed: 140 });
        g.sfx("coin");
        if (cards.every((c) => c.done)) {
          g.data.cleared = true;
          const bonus = Math.ceil(g.data.timeLeft) * TUNING.timeBonus;
          g.addScore(bonus, g.W / 2, grid.y + grid.h / 2);
          g.floatText(g.W / 2, grid.y - 20, "BOARD CLEAR!", "accent", 24);
          g.sfx("win"); g.flash("good", 0.2);
          g.after(1.5, () => { g.nextLevel(); deal(g); });
        }
      } else {
        g.data.streak = 0;
        g.data.wait = TUNING.peek;
        g.sfx("hit");
      }
    }
    break;
  }
});

g.draw((ctx, g) => {
  const grid = g.data.grid, s = grid.cell;
  g.data.cards.forEach((card, k) => {
    const c = k % grid.cols, r = Math.floor(k / grid.cols), q = grid.toPx(c, r);
    const sx = Math.abs(Math.cos(card.flip * Math.PI));
    const faceUp = card.flip > 0.5;
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.scale(Math.max(0.04, sx), 1);
    const w = s, h = s;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w / 2 + 2, -h / 2 + 4, w, h, 10) : ctx.rect(-w / 2 + 2, -h / 2 + 4, w, h); ctx.fill();
    if (faceUp) {
      ctx.fillStyle = card.done ? g.shade(g.color("good"), 0.55) : "#fff8ec";
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, 10) : ctx.rect(-w / 2, -h / 2, w, h); ctx.fill();
      if (!g.sprite(`card_${card.item}`, 0, 0, w * 0.78, h * 0.78)) {
        ctx.font = `${Math.round(s * 0.56)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(EMOJI[card.item] || "?", 0, s * 0.04);
      }
    } else {
      const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      grad.addColorStop(0, g.color("primary")); grad.addColorStop(1, g.shade(g.color("primary"), -0.35));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, 10) : ctx.rect(-w / 2, -h / 2, w, h); ctx.fill();
      if (!g.sprite("card_back", 0, 0, w * 0.8, h * 0.8)) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 2;
        ctx.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = `700 ${Math.round(s * 0.34)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("?", 0, 2);
      }
    }
    ctx.restore();
  });
  // Timer bar under the board.
  const i = Math.min(TUNING.time.length - 1, g.level - 1), frac = Math.max(0, g.data.timeLeft / TUNING.time[i]);
  const y = grid.y + grid.h + 22;
  g.panel(grid.x, y, grid.w, 14, { r: 7 });
  ctx.fillStyle = frac < 0.25 ? g.color("danger") : g.color("accent");
  ctx.fillRect(grid.x + 3, y + 3, (grid.w - 6) * frac, 8);
});
