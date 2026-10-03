// Recipe: quiz — trivia: a question with 4 answers and a countdown; faster
// correct answers score more, streaks multiply, wrong answers or timeouts cost
// a life. Replace QUESTIONS with themed ones (4 options, index of the answer).
const TUNING = { time: 10, base: 100, timeBonus: 10, reveal: 1.1 };
const QUESTIONS = [
  { q: "Which planet is known as the Red Planet?", a: ["Venus", "Mars", "Jupiter", "Saturn"], c: 1 },
  { q: "How many legs does a spider have?", a: ["6", "8", "10", "12"], c: 1 },
  { q: "What is the largest ocean on Earth?", a: ["Atlantic", "Indian", "Pacific", "Arctic"], c: 2 },
  { q: "Which gas do plants absorb from the air?", a: ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], c: 2 },
  { q: "What is the fastest land animal?", a: ["Cheetah", "Lion", "Horse", "Gazelle"], c: 0 },
  { q: "How many continents are there?", a: ["5", "6", "7", "8"], c: 2 },
  { q: "What is the freezing point of water in °C?", a: ["0", "32", "-10", "100"], c: 0 },
  { q: "Which shape has three sides?", a: ["Square", "Triangle", "Hexagon", "Circle"], c: 1 },
  { q: "What do bees make?", a: ["Milk", "Silk", "Honey", "Wax only"], c: 2 },
  { q: "Which is the smallest prime number?", a: ["0", "1", "2", "3"], c: 2 },
  { q: "What color do you get mixing blue and yellow?", a: ["Green", "Purple", "Orange", "Brown"], c: 0 },
  { q: "How many minutes are in an hour?", a: ["30", "60", "90", "100"], c: 1 }
];

const g = KULT.game({
  title: "Brain Blitz",
  hint: "Tap the right answer before time runs out. Streaks multiply your score!",
  lives: 3,
  background: { deco: "dots" },
  hud: { level: true }
});

function nextQuestion(g) {
  if (!g.data.queue.length) { g.data.queue = QUESTIONS.map((_, i) => i).sort(() => g.rand() - 0.5); g.nextLevel(); }
  g.data.current = QUESTIONS[g.data.queue.pop()];
  g.data.left = Math.max(5, TUNING.time - (g.level - 1));
  g.data.picked = null;
  g.data.revealT = 0;
}

function answer(g, i) {
  const q = g.data.current;
  g.data.picked = i;
  g.data.revealT = TUNING.reveal;
  if (i === q.c) {
    g.data.streak += 1;
    const pts = (TUNING.base + Math.round(g.data.left * TUNING.timeBonus)) * Math.min(5, g.data.streak);
    g.addScore(pts, g.W / 2, g.H * 0.3);
    g.sfx("coin"); g.burst(g.W / 2, g.H * 0.3, { color: ["good", "primary"], count: 20 });
  } else {
    g.data.streak = 0;
    g.sfx("hit"); g.shake(5, 0.2);
    g.loseLife({ title: "OUT OF LIVES" });
  }
}

g.setup((g) => {
  g.data.queue = QUESTIONS.map((_, i) => i).sort(() => g.rand() - 0.5);
  g.data.streak = 0;
  nextQuestion(g);
});

g.update((g, dt) => {
  g.hud.set("Streak", g.data.streak);
  if (g.data.revealT > 0) {
    g.data.revealT -= dt;
    if (g.data.revealT <= 0) nextQuestion(g);
    return;
  }
  g.data.left -= dt;
  if (g.data.left <= 0) { answer(g, -1); g.floatText(g.W / 2, g.H * 0.3, "TIME!", "danger", 30); return; }
  const m = /^a(\d)$/.exec(g.input.button || "");
  if (m) answer(g, Number(m[1]));
  const keys = ["Digit1", "Digit2", "Digit3", "Digit4"];
  keys.forEach((k, i) => { if (g.input.keyPressed(k)) answer(g, i); });
});

g.draw((ctx, g) => {
  const q = g.data.current;
  const total = Math.max(5, TUNING.time - (g.level - 1));
  g.panel(20, 100, g.W - 40, 12, { r: 6 });
  ctx.fillStyle = g.data.left > total * 0.3 ? g.pal.good : g.pal.danger;
  ctx.fillRect(22, 102, (g.W - 44) * Math.max(0, g.data.left / total), 8);
  g.panel(20, 130, g.W - 40, g.H * 0.26, { r: 20 });
  g.sprite("quiz", g.W / 2, 175, 70, 70);
  g.wrapText(q.q, g.W / 2, 130 + g.H * 0.15, g.W - 70, { size: 21, font: "display", align: "center", maxLines: 4 });
  q.a.forEach((text, i) => {
    let color = ["accent", "secondary", "primary", "good"][i];
    if (g.data.picked !== null) color = i === q.c ? "good" : i === g.data.picked ? "danger" : "#555a70";
    g.button(`a${i}`, { x: g.W / 2, y: g.H * 0.5 + i * 66, w: g.W - 60, h: 54, label: text, color, size: 18, font: "ui", disabled: g.data.picked !== null && i !== q.c && i !== g.data.picked });
  });
});
