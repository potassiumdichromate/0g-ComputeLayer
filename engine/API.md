# KULT Engine API (for game code)

The engine is already loaded. Write ONLY game logic with it. The engine already provides:
canvas sizing, touch + keyboard input, start menu, pause, mute, HUD (score, best, lives),
game-over screen, tap-to-restart, particles, screen shake, floating score text, sound effects,
sprite drawing with aspect/flip/animation, collisions and a background.
Never write your own requestAnimationFrame loop, resize handler, menu, restart logic,
canvas lookup, or event listeners.

## Coordinates
- Portrait (default): width `g.W` = 360, height `g.H` = 560–780 (read `g.H`, never assume).
- Games are portrait; do not set `orientation`.
- Entity `x, y` are the CENTER. `w, h` are the size. `e.left/right/top/bottom` exist.
- Velocities are pixels per second. Gravity is pixels per second².

## Skeleton (always this shape)
```js
const g = KULT.game({
  title: "Game Title",
  hint: "Tap to jump. Avoid the spikes.",     // shown on the start menu
  lives: 3,                                    // 0 = no lives HUD
  world: { floor: (g) => g.H - 120 },          // ground y for body entities (number or function), or omit
  background: { deco: "stars", speedX: 0, speedY: 0 },  // deco: stars|clouds|bubbles|dots|grid|hills|none
  hud: { level: true }
});

g.setup((g) => {
  // Runs at the start of EVERY run (and on restart). Create ALL run state here.
  // Anything registered here (onHit, every, after) is cleared on restart.
  g.data.speed = 160;
  g.data.player = g.spawn("player", { x: g.W / 2, y: g.H - 120, h: 56, moves: "runner", face: true });
  g.onHit("player", "enemy", (p, e) => { e.kill({ burst: true }); g.loseLife(); });
  g.every(() => Math.max(0.35, 1.2 - g.time * 0.02), () => { /* spawn */ });
});

g.update((g, dt) => {
  // Runs every frame while playing. Game rules, win/lose checks, difficulty.
});
```
Keep run state in `g.data` (reset automatically) or in variables assigned inside `setup`.
Do not use module-level mutable state that setup does not reset.

## Entities
`g.spawn(type, opts)` returns an entity. `type` is also a tag. If a sprite with the same
name exists in the asset catalog it is drawn automatically.

opts: `x, y, w, h` (or `size` for square, `r` for a circle radius),
`vx, vy, ax, ay, gravity, drag, maxSpeed, rot, spin, scale, alpha`,
`color` (palette key: primary|secondary|accent|danger|good|text|bg1|bg2, or CSS color),
`shape` (rect|circle|blob|tri|diamond|star|capsule) — used when there is no sprite,
`face: true` (cute eyes on shapes), `label` (text drawn on it), `glow` (color),
`sprite` (asset name; `null` to force a shape), `tags: ["enemy", ...]`, `hp`,
`ttl` (seconds to live), `z` (draw order), `fixed: true` (ignores camera),
`bounds` (none|clamp|clampX|wrap|wrapX|bounce|kill), `solid: true` (others land on it),
`oneWay: true` (land only from above), `body: true` (collides with solids and world.floor),
`hitbox` (0–1 fraction of size used for collisions, default 0.82), `shadow: true`,
`draw: (ctx, e, g) => {}` (custom drawing, centered at 0,0 — use instead of a sprite),
`data: {}` (your per-entity state), `pop: false` (no spawn pop animation).

If you give only `h` and a sprite exists, the width follows the sprite's aspect ratio.

Entity methods: `e.kill({ burst: true|{color,count}, sfx })`, `e.hit(damage, { invuln: 1 })`
→ true when it died, `e.flash()`, `e.pop()`, `e.is(tag)`, `e.tag(tag)`,
`e.distanceTo(o)`, `e.angleTo(o)`, `e.moveToward(x, y, speed)`, `e.grounded` (for body),
`e.dead`, `e.age`, `e.data`, `e.flipX`.

## Movement verbs — `e.moves(kind, opts)` or `spawn(..., { moves: kind, movesOpts })`
- `"runner"` — jump on tap/space/swipe-up, double jump, hold for higher. opts `{ jump: 480, gravity: 1400, doubleJump: true }`. Needs `world.floor` or solid platforms.
- `"platformer"` — hold left/right side of screen or arrows to move, tap/space to jump. opts `{ speed: 170, jump: 440, gravity: 1100, doubleJump: false }`.
- `"flap"` — tap to flap upward, falls with gravity, tilts. opts `{ flap: 310, gravity: 950 }`.
- `"topdown"` — drag anywhere (virtual joystick) or arrows/WASD, 8 directions. opts `{ speed: 180 }`.
- `"drag"` — follows the finger while held (paddles, ships), arrows otherwise. opts `{ axis: "x"|"y"|"xy", lerp: 14, speed: 300, offsetY: -40 }`.
- `"lanes"` — swipe or tap left/right half to change lane. opts `{ lanes: 3, start: 1 }`. Lane x = `g.lane(i, lanes)`.
- `"chase"` — steers toward a target entity or tag. opts `{ target: "player", speed: 80, turn: 4 }`.
- `"patrol"` — walks between x positions. opts `{ from, to, speed: 60 }`.
- `"sine"` — oscillates. opts `{ amp: 40, freq: 1.5, axis: "x"|"y" }`.
- `"fall"` — moves down at `speed` and is removed off-screen. opts `{ speed: 160 }`.
- `"wander"` — random drifting, bounces off edges. opts `{ speed: 50 }`.

`e.shoots({ every: 0.3, auto: true|"held"|false, dir: "up"|"down"|"left"|"right"|"aim"|angle|entity, speed: 520, type: "bullet", tags: [], w: 6, h: 16, color: "accent", spread: 0.2, count: 3, sfx: "shoot" })`
spawns projectiles automatically (`auto: false` = only on tap/space; "held" = while held).
Enemies can shoot too: `enemy.shoots({ every: 1.5, dir: player, type: "enemy_bullet", tags: ["hazard"] })`.

## Collisions and rules
- `g.onHit(tagA, tagB, (a, b) => {})` — called every frame while they overlap. Kill or flag one of them so it fires once.
- `g.overlaps(a, b)` — manual check.
- `g.all(tag)`, `g.first(tag)`, `g.count(tag)`, `g.clear(tag)`.

## Time, spawning, difficulty
- `g.every(seconds | () => seconds, fn)` — repeating timer (use a function for ramping spawn rates).
- `g.after(seconds, fn)` — one-shot.
- `g.time` — seconds in this run. `g.ramp(from, to, seconds)` — value that eases from→to over the run.
- `g.level`, `g.nextLevel()` — shows a LEVEL banner + sound; `g.onLevel((g, level) => {})`.
- Random (seeded): `g.rand()`, `g.range(a, b)`, `g.randInt(a, b)`, `g.pick(array)`, `g.chance(p)`.

## Score, lives, end
- `g.addScore(n, x, y, { combo: true })` — adds score, floats "+n" at x,y; combo multiplies streaks.
- `g.loseLife()` — shake + flash + sound; ends the run at 0 lives.
- `g.gainLife()`, `g.lives`, `g.score`, `g.best`.
- `g.over({ title: "CRASHED!" })` — game over screen. `g.win({ title: "LEVEL CLEAR!" })` — victory screen.
- Both report the score to the platform. Restart is automatic (tap after the end screen).

## Juice (use generously at meaningful moments)
- `g.burst(x, y, { color, count: 12, speed: 160, size: 5, life: 0.6, gravity: 300 })` — particles.
- `g.shake(amount = 6, seconds = 0.22)`, `g.flash(color, alpha)`, `g.floatText(x, y, text, color, size)`.
- `g.sfx(name)` — jump, flap, coin, pop, shoot, hit, explode, bounce, power, level, win, lose, click.
- `g.tween(obj, { x: 100, scale: 1.4 }, seconds, "out"|"in"|"inOut"|"back"|"elastic"|"linear", onDone)`.
- Entities pop in when spawned, squash on jump/land, flash on hit, and blink while invulnerable automatically.

## Camera and background
- `g.follow(entity, { x: false, y: true, onlyUp: true, anchorY: 0.6, lerp: 8 })` — for climbers/scrollers.
  Entities live in world coordinates; `g.camera.x/y` is the view offset. Use `fixed: true` for screen-space things.
- `g.bg.speedX / g.bg.speedY` — scroll the background (e.g. `g.bg.speedX = speed` for runners).
- An "environment" sprite, if provided, becomes the background automatically.

## HUD and drawing
- `g.hud.set("Ammo", 5)` — extra HUD line. Score, best, lives, pause and mute are automatic.
- `g.draw((ctx, g) => {})` — extra drawing above entities; `g.drawBehind((ctx, g) => {})` — below them.
  Both run in logical coordinates. Subtract `g.camera.x/y` for world positions.
  `g.text(str, x, y, { size, color, align, baseline, font: "display" | "ui", gradient: [top, bottom] })` draws outlined
  text in the style's web fonts (`display` for titles and numbers, `ui` for labels).
- Colors: `g.pal.primary` etc. or `g.color("accent")`. Never hardcode a palette; use palette keys.

## Built-in UI (do not rebuild it)
The engine draws a styled start menu (title, hero, PLAY button, controls hint, best score), the HUD
(score, best, lives, level, combo meter, pause and sound buttons), a pause panel (resume / restart / sound),
the game-over card (score, new-best confetti, time, level, PLAY AGAIN / home), level banners, fade transitions,
touch ripples and phone vibration. KULT.game options: `title`, `subtitle`, `hint`, `lives`, `hud: { level: true }`,
`haptics: false`, `touchRipples: false`.

## Input (only when a movement verb does not fit)
`g.input.pressed` (pressed this frame), `g.input.down`, `g.input.held`, `g.input.x/y` (logical),
`g.input.taps` (array of {x,y} this frame), `g.input.swipe` ("left"|"right"|"up"|"down"|null; arrow keys also set it),
`g.input.action` (space/enter/up pressed this frame), `g.input.axis()` → {x,y}, `g.input.side` (-1|0|1),
`g.input.key(code)`, `g.input.keyPressed(code)`.
Every game must be fully playable by touch alone.
