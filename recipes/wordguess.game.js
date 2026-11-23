// Recipe: wordguess — find the hidden 5-letter word in 6 guesses. Type on the
// on-screen keyboard (or a real one). Green = right letter, right spot; yellow
// = in the word elsewhere; grey = not in the word. Solving fast scores more and
// builds a streak; a missed word costs a life. Theme it by replacing WORDS.
const TUNING = { length: 5, tries: 6, solveBase: 60, streakBonus: 25, nextDelay: 1.8 };
const WORDS = ["apple", "beach", "brave", "candy", "chair", "cloud", "crown", "dance", "dream", "eagle", "earth", "flame", "fruit", "ghost", "giant", "grape", "heart", "honey", "house", "jelly", "juice", "knife", "lemon", "light", "magic", "mango", "music", "night", "ocean", "panda", "party", "pearl", "piano", "pilot", "pizza", "plant", "queen", "quiet", "river", "robot", "royal", "salad", "shark", "sheep", "shine", "smile", "snake", "space", "spice", "storm", "sugar", "sunny", "table", "tiger", "toast", "train", "unity", "voice", "water", "whale", "world", "yacht", "zebra", "brick", "clock", "drink", "flute", "globe", "horse", "laser", "medal", "noble", "orbit", "pixel", "quest", "radar", "skate", "torch", "vapor", "wheat"];
const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

const g = KULT.game({
  hero: (ctx, g, s) => ["W", "O", "R", "D"].forEach((L, i) => { const x = (i - 1.5) * s * 0.44, k = s * 0.4; ctx.fillStyle = [TILE.correct, TILE.present, TILE.correct, TILE.absent][i]; ctx.fillRect(x - k / 2, -k / 2, k, k); g.text(L, x, 1, { size: Math.round(s * 0.26), color: "text", align: "center", baseline: "middle", font: "display" }); }),
  title: "Word Hunt",
  hint: "Guess the 5-letter word in 6 tries. Green = right spot, yellow = wrong spot.",
  lives: 3,
  background: { deco: "dots" },
  hud: { level: true }
});

function newWord(g) {
  let w = g.pick(WORDS);
  if (g.data.answer && WORDS.length > 1) while (w === g.data.answer) w = g.pick(WORDS);
  g.data.answer = w.toUpperCase();
  g.data.rows = [];
  g.data.current = "";
  g.data.keys = {};
  g.data.done = false;
  g.data.shakeRow = 0;
  g.data.flipT = 0;
  g.data.message = "";
}

function grade(guess, answer) {
  const res = new Array(guess.length).fill("absent");
  const left = {};
  for (let i = 0; i < answer.length; i += 1) { if (guess[i] === answer[i]) res[i] = "correct"; else left[answer[i]] = (left[answer[i]] || 0) + 1; }
  for (let i = 0; i < guess.length; i += 1) if (res[i] !== "correct" && left[guess[i]]) { res[i] = "present"; left[guess[i]] -= 1; }
  return res;
}

const RANK = { absent: 1, present: 2, correct: 3 };
function submit(g) {
  if (g.data.current.length < TUNING.length) { g.data.shakeRow = 0.35; g.data.message = "Not enough letters"; g.sfx("hit"); return; }
  const guess = g.data.current, res = grade(guess, g.data.answer);
  g.data.rows.push({ guess, res });
  g.data.current = "";
  g.data.flipT = 0;
  for (let i = 0; i < guess.length; i += 1) if ((RANK[res[i]] || 0) > (RANK[g.data.keys[guess[i]]] || 0)) g.data.keys[guess[i]] = res[i];
  const tries = g.data.rows.length;
  if (res.every((r) => r === "correct")) {
    g.data.done = true;
    g.data.streak += 1;
    const pts = (TUNING.tries + 1 - tries) * TUNING.solveBase + (g.data.streak - 1) * TUNING.streakBonus;
    g.data.message = ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"][tries - 1] || "Solved!";
    g.after(0.9, () => {
      g.addScore(pts * g.level, g.W / 2, g.data.layout.top + 30, { combo: g.data.streak > 1 });
      g.sfx("win"); g.flash("good", 0.18);
      g.burst(g.W / 2, g.data.layout.top + tries * g.data.layout.step, { color: "good", count: 24, speed: 200 });
    });
    g.after(TUNING.nextDelay, () => { if (g.data.streak % 3 === 0) g.nextLevel(); newWord(g); });
  } else if (tries >= TUNING.tries) {
    g.data.done = true;
    g.data.streak = 0;
    g.data.message = `The word was ${g.data.answer}`;
    g.after(0.9, () => g.loseLife());
    g.after(TUNING.nextDelay + 0.6, () => { if (g.lives > 0) newWord(g); });
  } else g.sfx("click");
}

function press(g, key) {
  if (g.data.done) return;
  if (key === "ENTER") return submit(g);
  if (key === "DEL") { g.data.current = g.data.current.slice(0, -1); g.sfx("click"); return; }
  if (g.data.current.length < TUNING.length) { g.data.current += key; g.data.message = ""; g.sfx("pop"); }
}

g.setup((g) => {
  g.data.streak = 0;
  g.data.answer = null;
  // Tiles and keyboard sized to the screen height.
  const keyH = Math.min(48, Math.max(38, (g.H - 560) / 4 + 40));
  const kbH = keyH * 3 + 16;
  const avail = g.H - 96 - kbH - 30;
  const tile = Math.min(56, Math.floor((avail - 5 * 6) / TUNING.tries));
  g.data.layout = { tile, step: tile + 6, top: 92, keyH, kbTop: g.H - kbH - 14 };
  newWord(g);
});

g.update((g, dt) => {
  g.data.flipT += dt;
  g.data.shakeRow = Math.max(0, g.data.shakeRow - dt);
  g.hud.set("Streak", g.data.streak);
  const b = g.input.button;
  if (b && b.startsWith("k_")) press(g, b.slice(2));
  for (let i = 0; i < 26; i += 1) { const L = String.fromCharCode(65 + i); if (g.input.keyPressed("Key" + L)) press(g, L); }
  if (g.input.keyPressed("Enter")) press(g, "ENTER");
  if (g.input.keyPressed("Backspace")) press(g, "DEL");
});

const TILE = { correct: "#3fbf6a", present: "#d9b13b", absent: "#3a3550" };

g.draw((ctx, g) => {
  const L = g.data.layout, n = TUNING.length, w = n * L.tile + (n - 1) * 6, x0 = (g.W - w) / 2;
  for (let r = 0; r < TUNING.tries; r += 1) {
    const row = g.data.rows[r];
    const live = r === g.data.rows.length && !g.data.done;
    const shake = live && g.data.shakeRow > 0 ? Math.sin(g.data.shakeRow * 60) * 6 : 0;
    for (let i = 0; i < n; i += 1) {
      const x = x0 + i * (L.tile + 6) + shake, y = L.top + r * L.step;
      let letter = row ? row.guess[i] : live ? g.data.current[i] : "";
      let fill = "rgba(255,255,255,0.06)", stroke = letter ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.2)";
      let sy = 1;
      if (row) {
        const isLast = r === g.data.rows.length - 1, t = isLast ? g.data.flipT * 5 - i * 0.9 : 9;
        sy = t < 1 ? Math.abs(Math.cos(Math.max(0, t) * Math.PI)) : 1;
        if (t >= 0.5) { fill = TILE[row.res[i]]; stroke = fill; }
      }
      ctx.save();
      ctx.translate(x + L.tile / 2, y + L.tile / 2); ctx.scale(1, Math.max(0.05, sy));
      ctx.fillStyle = fill; ctx.fillRect(-L.tile / 2, -L.tile / 2, L.tile, L.tile);
      ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(-L.tile / 2 + 1, -L.tile / 2 + 1, L.tile - 2, L.tile - 2);
      ctx.restore();
      if (letter) g.text(letter, x + L.tile / 2, y + L.tile / 2 + 1, { size: Math.round(L.tile * 0.52), color: "text", align: "center", baseline: "middle", font: "display" });
    }
  }
  if (g.data.message) g.text(g.data.message, g.W / 2, L.top + TUNING.tries * L.step + 8, { size: 16, color: g.data.done && g.data.streak ? "good" : "accent", align: "center", font: "display" });
  // Keyboard.
  ROWS.forEach((keys, ri) => {
    const y = L.kbTop + ri * (L.keyH + 6) + L.keyH / 2;
    const extra = ri === 2 ? 2 : 0, kw = Math.min(33, (g.W - 12 - 4 * (keys.length + extra)) / (keys.length + extra * 1.5));
    const total = keys.length * (kw + 4) + (extra ? 2 * (kw * 1.5 + 4) : 0) - 4;
    let x = (g.W - total) / 2;
    const key = (id, label, width, color) => { g.button("k_" + id, { x: x + width / 2, y, w: width, h: L.keyH, label, color, size: label.length > 1 ? 12 : 21, radius: 8 }); x += width + 4; };
    if (ri === 2) key("ENTER", "ENTER", kw * 1.5, "accent");
    for (const k of keys) {
      const st = g.data.keys[k];
      key(k, k, kw, st === "correct" ? "good" : st === "present" ? "#d9b13b" : st === "absent" ? "#3a3550" : "secondary");
    }
    if (ri === 2) key("DEL", "DEL", kw * 1.5, "danger");
  });
});
