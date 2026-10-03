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
    keywords: ["lane", "lanes", "3 lanes", "three lanes", "subway surfers", "subway", "train tracks", "train", "temple run", "dodge", "swipe", "lane runner"],
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
    id: "match3", name: "Match-3 puzzle", verbs: ["grid", "tap/swipe"],
    keywords: ["match 3", "match-3", "match three", "candy crush", "bejeweled", "gems", "jewels", "swap", "cascade", "candy"],
    summary: "Swap neighbouring tiles on a grid to make lines of 3+, cleared tiles cascade and refill, combo scoring, move limit with score goals per level."
  },
  {
    id: "merge2048", name: "2048 / sliding merge grid", verbs: ["grid", "swipe"],
    keywords: ["2048", "merge numbers", "sliding tiles", "slide", "number puzzle", "threes", "merge tiles"],
    summary: "Swipe to slide every tile on a 4x4 grid; equal tiles merge and double, a new tile appears each move, game ends when no move is possible."
  },
  {
    id: "sokoban", name: "Sokoban / push puzzle", verbs: ["grid", "swipe", "buttons"],
    keywords: ["sokoban", "push boxes", "crates", "warehouse", "box pushing", "push puzzle", "logic puzzle"],
    summary: "Grid push puzzle: walk with swipes, push crates onto goals, hand-made levels, undo and reset buttons, move counter."
  },
  {
    id: "towerdefense", name: "Tower defense", verbs: ["path", "tap to build", "waves"],
    keywords: ["tower defense", "tower defence", "td", "plants vs zombies", "defend", "defense", "turrets", "waves of enemies", "path", "build towers", "garden defense", "lane defense"],
    summary: "Enemies walk a winding path in growing waves; tap build spots to place towers with coins and tap towers to upgrade; leaks cost lives; bounty coins per kill."
  },
  {
    id: "mergedrop", name: "Merge-drop physics (Suika)", verbs: ["drag/release", "physics"],
    keywords: ["suika", "watermelon", "merge fruit", "drop and merge", "fruit merge", "merge game", "drop", "stack and merge", "bricks merge"],
    summary: "Aim and drop round pieces into a jar with simple circle physics; two of the same size merge into the next size; the run ends when the pile stays above the line."
  },
  {
    id: "penalty", name: "Football penalty shootout", verbs: ["swipe to shoot", "keeper AI"],
    keywords: ["penalty", "football", "soccer", "goalkeeper", "free kick", "shootout", "goal", "striker", "world cup"],
    summary: "Swipe from the ball toward the goal to shoot with curve; a keeper sways and dives with growing skill; corners and top bins score more; 5 shots per round, 3 goals to advance."
  },
  {
    id: "cricket", name: "Cricket batting", verbs: ["timing tap"],
    keywords: ["cricket", "batting", "batsman", "bowler", "sixes", "ipl", "wicket", "over", "super over", "baseball", "home run"],
    summary: "Bowler delivers down a perspective pitch with line and bounce; tap to swing as the ball reaches the bat; timing gives SIX/FOUR/runs; straight balls you miss bowl you out; 6 balls per over, speed rises."
  },
  {
    id: "timing", name: "Sports timing shot (power meter)", verbs: ["power meter", "projectile arc"],
    keywords: ["basketball", "hoops", "free throw", "golf", "power meter", "timing", "shot", "darts", "archery", "bowling", "throw"],
    summary: "A power meter sweeps; tap to lock it; the ball arcs to a target (hoop). Sweet spot = perfect, near = rim roll, off = miss; streak multiplier; the target moves at higher levels."
  },
  {
    id: "fishing", name: "Fishing", verbs: ["hold/release", "drag", "tension minigame"],
    keywords: ["fishing", "fish", "angler", "hook", "reel", "ocean", "lake", "catch fish", "deep sea"],
    summary: "Hold to lower the hook, drag to steer the boat, release to reel; hooked fish start a tension tug-of-war (hold/release to keep a marker in a moving zone); rare fish pay more, jellyfish sting; timed run."
  },
  {
    id: "rhythm", name: "Rhythm lanes", verbs: ["lane taps", "beat timing"],
    keywords: ["rhythm", "music", "beat", "dance", "piano tiles", "guitar hero", "notes", "song", "dj", "drum", "tap to the beat"],
    summary: "Notes fall down 4 lanes to a hit line on a BPM grid with a metronome; tap the lane in time; perfect/good/miss, combo multiplier, health drains on misses, tempo and chords increase per level."
  },
  {
    id: "racer", name: "Top-down racer / endless driving", verbs: ["steer", "scrolling road"],
    keywords: ["racer", "racing", "race", "top-down racer", "driving", "drive", "highway", "car", "cars", "road", "road trip", "rally", "kart", "motorbike", "fuel", "traffic"],
    summary: "Free steering on an endless winding road seen from above; overtake traffic, stay off the grass (it slows you), collect coins, refuel before the tank runs dry; speed climbs."
  },
  {
    id: "platformer", name: "Side-scrolling platformer", verbs: ["platformer", "follow camera", "stomp"],
    keywords: ["platformer", "mario", "side scroller", "levels", "jump and run", "stomp", "flag", "adventure", "metroidvania"],
    summary: "Run and jump through a generated side-scrolling level of platforms and gaps; stomp patrolling enemies, collect coins, checkpoints, reach the flag; each level is longer and harder."
  },
  {
    id: "survivor", name: "Survivor roguelite", verbs: ["topdown", "auto-attack", "upgrade cards"],
    keywords: ["vampire survivors", "survivor", "roguelite", "roguelike", "bullet heaven", "upgrades", "level up", "horde", "xp"],
    summary: "Joystick movement in an endless field, weapons auto-fire at the nearest enemy, swarms grow over time, kills drop XP gems; each level-up pauses and offers 3 upgrade cards (damage, fire rate, extra shot, speed, magnet, orbiting blade, heal)."
  },
  {
    id: "bullethell", name: "Bullet hell (boss patterns)", verbs: ["drag", "patterns", "graze"],
    keywords: ["bullet hell", "danmaku", "touhou", "dodge bullets", "bullet patterns", "boss rush", "shmup boss"],
    summary: "A boss fires dense rotating patterns (rings, spirals, aimed fans) that intensify below 1/3 HP; the player has a tiny hitbox, auto-fires, and earns graze points for near misses; each boss is tougher."
  },
  {
    id: "bossarena", name: "Boss arena duel", verbs: ["topdown", "dash", "telegraphs"],
    keywords: ["boss fight", "boss arena", "souls", "dodge roll", "dash", "titan", "duel", "raid", "monster hunter"],
    summary: "Top-down duel against one big boss: auto-attack in range, tap to dash with invulnerability, the boss telegraphs charges, ground slams and projectile rings with red zones, faster phases at low HP."
  },
  {
    id: "pinball", name: "Pinball", verbs: ["flippers", "segment physics"],
    keywords: ["pinball", "flipper", "bumpers", "arcade table", "ball bounce", "plinko"],
    summary: "Two flippers on tap/keys, circle-vs-segment ball physics with substeps, kicking bumpers, top lanes that light up for a score multiplier, drain between the flippers, 3 balls."
  },
  {
    id: "slingshot", name: "Slingshot physics puzzle", verbs: ["drag and release", "projectile", "stacking"],
    keywords: ["angry birds", "slingshot", "catapult", "launch", "physics puzzle", "knock down", "towers", "trajectory", "cannon"],
    summary: "Drag back and release to launch a projectile with a trajectory preview; knock out targets sheltered in block towers; blocks take damage and fall when supports break; 3 shots per level."
  },
  {
    id: "cardbattle", name: "Card battler / deck builder", verbs: ["cards", "energy", "turns", "buttons"],
    keywords: ["card", "cards", "deck", "deck builder", "deckbuilder", "slay the spire", "hearthstone", "card battle", "tcg", "ccg", "hand"],
    summary: "Turn-based deck builder: draw 5 cards, spend 3 energy on attack/block/heal/draw cards, read the enemy intent, end turn; beating an enemy lets you add 1 of 3 new cards; enemies scale."
  },
  {
    id: "turnbased", name: "Turn-based RPG combat", verbs: ["buttons", "turns"],
    keywords: ["turn based", "turn-based", "rpg", "jrpg", "pokemon", "final fantasy", "battle", "hero", "monster battle", "dungeon crawler", "party"],
    summary: "Hero vs monster duel with ATTACK, SKILL (MP), DEFEND (halve damage, restore MP) and POTION buttons; the monster answers with attacks, crits and misses; wins level the hero up against stronger monsters."
  },
  {
    id: "idle", name: "Idle / clicker", verbs: ["tap target", "upgrade buttons", "income"],
    keywords: ["idle", "clicker", "incremental", "tycoon", "cookie clicker", "tap to earn", "upgrades", "money", "factory", "empire"],
    summary: "Tap a big object to earn; buy upgrades (stronger tap, helpers per second, factories, x2 boost) whose costs grow per purchase; passive income ticks every frame; milestones level up; never ends."
  },
  {
    id: "quiz", name: "Quiz / trivia", verbs: ["answer buttons", "timer"],
    keywords: ["quiz", "trivia", "questions", "answers", "kbc", "millionaire", "general knowledge", "brain", "test", "exam", "learn"],
    summary: "A question with 4 answer buttons and a countdown bar; faster correct answers score more, streaks multiply; wrong answers or timeouts cost a life; question bank is a plain array to theme."
  },
  {
    id: "rts", name: "Simple RTS / lane war", verbs: ["unit buttons", "economy", "auto-battle"],
    keywords: ["rts", "strategy", "age of war", "clash", "units", "army", "base", "lane war", "castle", "troops", "battle strategy", "kingdom"],
    summary: "Gold flows in; buy soldiers, archers and tanks that march up a lane and fight automatically; upgrade the mine for income; destroy the enemy base while defending yours; enemy AI spawns stronger units each level."
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
  // Whole-word matches only ("plane" must not match "planets"); multi-word and
  // longer, more specific keywords count more; naming the genre itself wins ties.
  const has = (word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
  for (const recipe of listRecipes()) {
    let score = recipe.keywords.reduce((sum, word) => sum + (has(word) ? word.split(" ").length + (word.length >= 6 ? 0.5 : 0) : 0), 0);
    if (has(recipe.id)) score += 1;
    if (score > bestScore) { best = recipe; bestScore = score; }
  }
  return best ?? getRecipe("runner");
}
