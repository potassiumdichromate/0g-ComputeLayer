import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Known-good genre games written on the KULT Engine. The Engineer agent adapts
// the closest one instead of writing a game from a blank page, and the Game
// Designer maps a prompt onto one of these mechanic families. Every recipe must
// pass `npm run test:recipes`.
export const RECIPES = [
  {
    id: "flappy", name: "Flappy / tap-to-fly", verbs: ["flap"],
    keywords: ["flappy", "flap", "fly", "bird", "helicopter", "wings", "tap to fly", "gap", "pipes", "balloon", "bee", "dragon fly"],
    summary: "One-button flight through scrolling gaps. Gravity + flap impulse, obstacles scroll left, score per gate passed, instant death on hit."
  },
  {
    id: "runner", name: "Endless runner", verbs: ["runner"],
    keywords: ["runner", "run", "endless", "dash", "jump over", "parkour", "dino", "ninja run", "surfer", "skate", "sprint"],
    summary: "Side-view auto-runner on a ground line. Tap to jump / double jump over hazards, collect coin arcs, speed ramps over time, 3 lives."
  },
  {
    id: "jumper", name: "Vertical jumper / climber", verbs: ["platformer", "follow"],
    keywords: ["doodle", "jump up", "climb", "tower", "vertical", "bounce", "platforms", "sky", "higher", "rise", "jumper"],
    summary: "Auto-bouncing character climbs one-way platforms, steered left/right, camera follows upward, falling off the bottom ends the run."
  },
  {
    id: "shooter", name: "Vertical shoot-'em-up", verbs: ["drag", "shoots", "sine", "fall"],
    keywords: ["shooter", "shoot", "space", "spaceship", "invaders", "galaga", "bullet", "blaster", "alien", "shmup", "plane", "jet"],
    summary: "Drag a ship along the bottom, it auto-fires upward. Enemy waves descend with patterns and fire back, power-ups, 3 lives."
  },
  {
    id: "lanes", name: "Lane dodger", verbs: ["lanes", "fall"],
    keywords: ["lane", "traffic", "car", "racing", "race", "road", "highway", "dodge", "subway", "swipe", "drive", "driving"],
    summary: "Swipe or tap sides to switch between 3 lanes, dodge oncoming obstacles, grab coins, speed ramps, 3 lives."
  },
  {
    id: "breakout", name: "Brick breaker", verbs: ["drag", "bounce"],
    keywords: ["breakout", "brick", "arkanoid", "paddle", "ball", "blocks", "smash", "pong"],
    summary: "Drag a paddle to bounce a ball into a grid of bricks with hit points. Clear all bricks to level up; missing the ball costs a life."
  },
  {
    id: "arena", name: "Top-down arena survival", verbs: ["topdown", "chase"],
    keywords: ["arena", "survive", "survival", "zombie", "horde", "top-down", "topdown", "vampire", "monsters", "wave", "twin stick", "dungeon"],
    summary: "Move with a virtual joystick, auto-fire at the nearest enemy, enemies chase from the edges in growing waves, collect gems, 3 lives."
  },
  {
    id: "catcher", name: "Falling-object catcher", verbs: ["drag", "fall"],
    keywords: ["catch", "catcher", "basket", "falling", "fruit", "collect", "rain", "drop", "bucket", "food"],
    summary: "Drag a catcher along the bottom to collect falling good items and avoid bad ones. Missing good items costs lives, speed ramps."
  }
];

export function listRecipes() {
  return RECIPES.filter((r) => existsSync(join(here, `${r.id}.game.js`)));
}

export function getRecipe(id) {
  return RECIPES.find((r) => r.id === id) ?? null;
}

export function recipeCode(id) {
  return readFileSync(join(here, `${id}.game.js`), "utf8");
}

// Cheap deterministic match used as the fallback when the brief agent fails.
export function matchRecipe(prompt) {
  const text = String(prompt || "").toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const recipe of listRecipes()) {
    const score = recipe.keywords.reduce((sum, word) => sum + (text.includes(word) ? word.split(" ").length : 0), 0);
    if (score > bestScore) { best = recipe; bestScore = score; }
  }
  return best ?? getRecipe("runner");
}
