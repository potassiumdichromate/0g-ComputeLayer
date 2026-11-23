import { Brief, GameDesign, ArtDirection, Copy, EditPlan } from "../contracts/index.js";
import { askJson } from "../llm/json.js";
import { listRecipes, getRecipe, recipeCode, matchKnownGame, scoreRecipe } from "../../recipes/index.js";
import { getStyle, inferStyle, listStyles, STYLE_PRESETS } from "../../styles/presets.js";

// Planning agents: turn one sentence into a buildable, typed plan.
//   brief        — genre, closest recipe, art style, title
//   designer     — full game design document (the contract for art + code)
//   artDirector  — style guide + sprite catalog derived from the design
//   copywriter   — store listing text
//   editRouter   — decides which subagents an edit request needs

const ENGINE_CAPABILITIES = [
  "The KULT Engine (2D canvas, portrait 360 x ~700 logical px) provides built in: start/pause/game-over menus, tap-to-restart, score/best/lives HUD, particles, screen shake, floating score text, synthesized sound effects, sprite rendering, collisions, a scrolling decorated background, a following camera, levels with banners.",
  "Movement verbs available: runner (auto-run + jump/double jump), platformer (steer + jump), flap (tap to fly), topdown (virtual joystick), drag (entity follows finger), lanes (swipe between lanes), chase (steer toward target), patrol, sine (oscillate), fall (drop down screen), wander. Any entity can shoot projectiles automatically or on tap.",
  "Board, card, puzzle and UI games: g.grid (cell math + drawing), g.button (tappable buttons), g.panel, g.wrapText, g.sprite, tap lists and swipes. Turn-based games with a computer opponent (minimax or heuristics), word games with on-screen keyboards, timers and rounds are all normal game logic.",
  "Anything else (grids, custom rules, special abilities, bosses, power-ups, timers, AI opponents) is written as game logic on top."
].join("\n");

// Settles what game is being made. A named known game always wins (chess is
// chess), a recipe is used only when it really fits, otherwise the game is
// written from scratch (fit "none", no recipe).
export function resolveRoute(prompt, value = {}, { trustPrompt = true } = {}) {
  const known = matchKnownGame(value.knownGame) ?? (trustPrompt ? matchKnownGame(prompt) : null);
  if (known) {
    return { knownGame: known.name, recipe: known.recipe, fit: known.recipe ? "exact" : "none" };
  }
  const fit = ["exact", "close", "none"].includes(value.fit) ? value.fit : "none";
  const recipe = fit !== "none" && getRecipe(value.recipe) ? value.recipe : null;
  return { knownGame: value.knownGame || null, recipe, fit: recipe ? fit : "none" };
}

function tuningKeys(recipeId) {
  try {
    const code = recipeCode(recipeId);
    const block = code.match(/const TUNING = \{([^}]*)\}/)?.[1] ?? "";
    return block.trim();
  } catch {
    return "";
  }
}

function titleFromPrompt(prompt) {
  const explicit = String(prompt).match(/(?:called|named|titled)\s+["']?([A-Za-z0-9' -]{3,40})/i)?.[1];
  if (explicit) return explicit.trim();
  const words = String(prompt)
    .replace(/\b(make|create|build|generate|a|an|the|game|me|please|where|with|that|and|of|in)\b/gi, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 3);
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ") : "Untitled Game";
}

// ------------------------------------------------------------------ brief
export const brief = {
  retries: 1,
  timeoutMs: 2 * 60_000,
  async run(ctx) {
    const { prompt } = ctx.input;
    const forcedStyle = getStyle(ctx.input.style) ? ctx.input.style : null;
    const { value } = await askJson({
      llm: ctx.llm, role: "brief", purpose: "brief", schema: Brief, maxTokens: 1200, temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "You are the producer of a mobile web-game studio. Read a creator's game idea and decide WHAT GAME it is before anything else. The creator must get the game they asked for.",
            "1. knownGame: if the idea names an existing game or a genre with fixed rules (chess, checkers, connect four, tic-tac-toe, sudoku, solitaire, snake, tetris, wordle, pong, minesweeper, 2048, ludo, poker…), write its name. The game must BE that game with its real rules — a theme or twist never replaces the rules. Otherwise null.",
            "Every game is a 2D phone game. If the idea asks for 3D, VR or a first-person view, keep its game and core actions and plan the best 2D version (top-down, side view, or a 2D pseudo-3D road or tunnel), never refuse and never switch to a different game.",
            "2. coreActions: what the player actually does moment to moment, in the idea's own terms (e.g. \"moves chess pieces by the rules to checkmate the opponent\").",
            "3. recipe + fit: our studio has tested starting games (below). Compare CORE PLAYER ACTIONS, never theme words.",
            "   exact = the recipe is that very game; close = same core action and controls, different theme (a cat jumping over cucumbers → runner); none = no recipe has the same core actions.",
            "   If the idea depends on a structure the recipe does not have (laps around a closed track, corners to drift through, a map to explore, a turn order, a deck of cards), the fit is none even when the theme words match.",
            "   When in doubt choose none — the team then builds the game from scratch, which is far better than shipping a different game. A chess idea is never a battle game; a puzzle idea set in space is never a shooter. recipe is null when fit is none.",
            "4. style: the art style that best fits the theme" + (forcedStyle ? ` — the creator already picked "${forcedStyle}", use it.` : "."),
            "5. title: short, catchy, ORIGINAL (max 4 words; never a famous game's trademarked name). pitch: one exciting sentence that says what the player does.",
            'Return ONLY JSON: {"title","pitch","genre","knownGame":string|null,"coreActions","recipe":string|null,"fit":"exact"|"close"|"none","style","orientation":"portrait"}',
            "Recipes:",
            ...listRecipes().map((r) => `- ${r.id}: ${r.name} — ${r.summary}`),
            "Styles:",
            ...listStyles().map((s) => `- ${s.id}: ${s.description}`)
          ].join("\n")
        },
        { role: "user", content: `IDEA:\n${prompt}\n\n` }
      ]
    });
    // The idea names a known game the producer did not pick: ask once whether
    // the creator wants that game itself ("chess") or only uses it as a theme
    // ("a runner dodging chess pieces").
    const fromPrompt = matchKnownGame(prompt);
    let trustPrompt = true;
    if (fromPrompt && matchKnownGame(value.knownGame)?.name !== fromPrompt.name) {
      const reply = await ctx.llm.chat({
        role: "brief", purpose: "brief-check", maxTokens: 20, temperature: 0, retries: 1, timeoutMs: 45_000,
        messages: [{ role: "user", content: `A creator asked for this game: "${prompt}"
Do they want to play ${fromPrompt.name} itself (its real rules, maybe with a theme or twist)? Or is ${fromPrompt.name} only a theme or object inside a different kind of game? Answer only YES (it is ${fromPrompt.name}) or NO (different game).` }]
      }).catch(() => null);
      trustPrompt = !reply || !/^\W*no(?![a-z])/i.test(String(reply.content));
    }
    return {
      ...value,
      ...resolveRoute(prompt, value, { trustPrompt }),
      orientation: "portrait",
      style: forcedStyle ?? (getStyle(value.style) ? value.style : inferStyle(prompt))
    };
  },
  async fallback(ctx) {
    const { prompt } = ctx.input;
    const scored = scoreRecipe(prompt);
    const route = resolveRoute(prompt, { recipe: scored.score >= 2 ? scored.recipe?.id : null, fit: scored.score >= 2 ? "close" : "none" });
    return {
      title: titleFromPrompt(prompt), pitch: String(prompt).slice(0, 200), genre: route.knownGame ?? "arcade",
      coreActions: String(prompt).slice(0, 200), ...route,
      style: getStyle(ctx.input.style) ? ctx.input.style : inferStyle(prompt),
      orientation: "portrait"
    };
  }
};

// --------------------------------------------------------------- designer
export const designer = {
  retries: 1,
  timeoutMs: 4 * 60_000,
  async run(ctx) {
    const b = ctx.out("brief");
    const recipe = b.fit !== "none" ? getRecipe(b.recipe) : null;
    const family = recipe
      ? [
          b.fit === "exact"
            ? `- This IS our tested ${recipe.name} game: keep its complete rules and structure, and design the creator's theme, look, names and tuning on top. Name entities after the pieces/objects that game shows.`
            : `- Closest tested game with the same core action: ${recipe.id} (${recipe.summary}). Build on its controls and structure, but where the idea differs the IDEA wins.`,
          `  Its tunable parameters today: ${tuningKeys(recipe.id) || "(free)"}`
        ]
      : [
          "- No template: this game is written from scratch, so design EXACTLY the game in the idea — its real rules, board/layout, turns, win and lose conditions, opponent AI if it has an opponent.",
          b.knownGame ? `- It is ${b.knownGame}: specify its COMPLETE real rules (every piece/card/move type, special rules, scoring, end conditions). Nothing simplified away.` : ""
        ];
    const { value } = await askJson({
      llm: ctx.llm, role: "designer", purpose: "designer", schema: GameDesign, maxTokens: 6000, temperature: 0.45,
      messages: [
        {
          role: "system",
          content: [
            "You are the lead game designer of a studio famous for instantly fun, polished mobile games.",
            "Turn the brief into a complete, BUILDABLE game design document. The programmer implements exactly what you write, so be concrete: numbers, counts, speeds, timings.",
            "THE IDEA IS THE CONTRACT: the creator must instantly recognise the game they asked for. Never swap the requested game for a different genre, and never drop a mechanic the idea names.",
            "Design principles you always follow:",
            "- The core action is understood in 3 seconds and feels good on the first tap.",
            "- Clear goal, clear failure, and a reason to try again (score chase, near misses, combos).",
            "- Risk vs reward: the best rewards sit next to danger.",
            "- Difficulty escalates in concrete steps (speed, spawn rate, new enemy types) — list them in progression.",
            "- 3 to 7 entities total. Every entity has a distinct role, look, and interaction. Name them in snake_case, and the controlled character (or the player's main piece) MUST be named \"player\". Board, card and puzzle games list their pieces/cards/tiles as entities.",
            "- Only design what the engine + a few hundred lines of game logic can build well.",
            ...family.filter(Boolean),
            "- Feedback moments (juice): list the moments that get particles, shake, flashes, floating text or sounds.",
            "- Controls must work with touch alone; the hint is one short sentence shown on the start screen.",
            "",
            ENGINE_CAPABILITIES,
            "",
            "Return ONLY JSON with this shape:",
            '{"title","pitch","recipe","orientation","controls":{"touch","keyboard","hint"},"coreLoop","entities":[{"name","role":"player|enemy|obstacle|hazard|collectible|powerup|projectile|platform|prop","description":"what it looks like","behavior":"how it moves (use the verbs)","spawn":"when/where/how often","interaction":"what happens on contact","size":48,"needsSprite":true}],"rules":[...],"scoring":[...],"lives":3,"progression":[...],"winCondition":null,"loseCondition","tuning":{"name":number},"juice":[...],"background":{"description","deco":"stars|clouds|bubbles|dots|grid|hills|none"}}',
            "needsSprite is false for pure structure (walls, pipes, lanes, bullets, platforms) that looks best as clean shapes."
          ].join("\n")
        },
        {
          role: "user",
          content: [
            `IDEA:\n${ctx.input.prompt}\n`,
            `BRIEF: ${JSON.stringify({ title: b.title, pitch: b.pitch, genre: b.genre, knownGame: b.knownGame, coreActions: b.coreActions, orientation: b.orientation })}`,
            recipe ? `Tested game to build on: ${recipe.id} [[recipe:${recipe.id}]] (fit: ${b.fit})` : "Built from scratch (no template).",
            "Keep the title from the brief unless it is weak."
          ].join("\n")
        }
      ]
    });
    // Every game ships portrait (the player frame is a tall phone screen).
    return { ...value, recipe: recipe?.id ?? null, fit: recipe ? b.fit : "none", knownGame: b.knownGame ?? null, coreActions: b.coreActions ?? "", orientation: "portrait" };
  },
  async fallback(ctx) {
    const b = ctx.out("brief");
    return defaultDesign(b, ctx.input.prompt);
  }
};

export function defaultDesign(b, prompt) {
  const recipe = b.fit !== "none" ? getRecipe(b.recipe) : null;
  if (!recipe) {
    return {
      ...GameDesign.parse({
        title: b.title, pitch: b.pitch || String(prompt).slice(0, 200), recipe: null, orientation: "portrait",
        controls: { touch: "", keyboard: "", hint: "" },
        coreLoop: b.coreActions || String(prompt).slice(0, 300),
        entities: [{ name: "player", role: "player", description: `the player's piece for: ${String(prompt).slice(0, 160)}`, behavior: "", spawn: "", interaction: "", size: 52, needsSprite: true }],
        rules: b.knownGame ? [`Implement the complete real rules of ${b.knownGame}.`] : [], scoring: [], lives: 3, progression: [], winCondition: null, loseCondition: "Lose the game",
        tuning: {}, juice: [], background: { description: "", deco: "dots" }
      }),
      fit: "none", knownGame: b.knownGame ?? null, coreActions: b.coreActions ?? ""
    };
  }
  const code = recipeCode(recipe.id);
  // Entities the recipe spawns, plus art it draws itself with g.sprite("name")
  // (board, card and UI games draw instead of spawning).
  const spawned = [...code.matchAll(/spawn\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const drawn = [...code.matchAll(/g\.sprite\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const listed = [...code.matchAll(/const (?:KINDS|NAMES) = \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1])).slice(0, 5);
  drawn.push(...listed);
  const types = [...new Set(["player", ...spawned, ...drawn])].slice(0, 10);
  const structural = new Set(["gate", "platform", "bullet", "enemy_bullet", "brick", "paddle", "ball", "ground", "hook", "arrow", "shot", "orb", "slash", "bolt"]);
  return { fit: b.fit, knownGame: b.knownGame ?? null, coreActions: b.coreActions ?? "", ...GameDesign.parse({
    title: b.title, pitch: b.pitch || String(prompt).slice(0, 200), recipe: recipe.id, orientation: b.orientation,
    controls: { touch: "", keyboard: "", hint: "" },
    coreLoop: recipe.summary,
    entities: types.map((name) => ({
      name, role: name === "player" ? "player" : /coin|gem|item|powerup/.test(name) ? "collectible" : /enemy/.test(name) ? "enemy" : /platform/.test(name) ? "platform" : "obstacle",
      description: `${name.replace(/_/g, " ")} for: ${String(prompt).slice(0, 120)}`,
      behavior: "", spawn: "", interaction: "", size: name === "player" ? 52 : 36, needsSprite: !structural.has(name)
    })),
    rules: [], scoring: [], lives: 3, progression: [], winCondition: null, loseCondition: "Lose all lives",
    tuning: {}, juice: [], background: { description: "", deco: "stars" }
  }) };
}

// ------------------------------------------------------------ art director
function catalogFromDesign(design, maxSprites) {
  return design.entities
    .filter((e) => e.needsSprite)
    .slice(0, Math.max(1, maxSprites || 1))
    .map((e) => ({ name: e.name, role: e.role, description: e.description || e.name, width: 256, height: 256, facing: e.role === "player" || e.role === "enemy" ? "right" : "none" }));
}

export function mergeStyle(styleId, direction) {
  const preset = getStyle(styleId) ?? getStyle("cartoon");
  const palette = { ...preset.palette };
  for (const [k, v] of Object.entries(direction?.palette ?? {})) if (v) palette[k] = v;
  return { ...preset, palette, deco: direction?.deco ?? preset.deco, notes: direction?.notes ?? "" };
}

export const artDirector = {
  retries: 1,
  timeoutMs: 3 * 60_000,
  async run(ctx) {
    const design = ctx.out("design");
    const b = ctx.out("brief");
    const max = ctx.config.features.maxSprites;
    const styleId = b.style;
    // Tier without drawn sprites: no LLM call, the catalog only names entities.
    if (ctx.config.features.sprites === "none") {
      return { styleId, style: mergeStyle(styleId, { deco: design.background?.deco }), catalog: catalogFromDesign(design, 8), environmentPrompt: design.background?.description ?? "", coverPrompt: "" };
    }
    const preset = STYLE_PRESETS[styleId];
    const { value } = await askJson({
      llm: ctx.llm, role: "artDirector", purpose: "artDirector", schema: ArtDirection, maxTokens: 3000, temperature: 0.5,
      messages: [
        {
          role: "system",
          content: [
            "You are the art director of a mobile game studio. Define one cohesive look and brief every sprite.",
            `Locked art style: ${preset.name} — ${preset.description}`,
            `Base palette (keys the game code uses): ${JSON.stringify(preset.palette)}. You may adjust individual colors so the palette fits this game's world (e.g. underwater → blue backgrounds), but keep strong contrast between bg1/bg2 and primary/secondary/accent/danger/good, and keep text readable on the background.`,
            `Plan at most ${max} sprites: "player" first, then the most important entities that have needsSprite=true. Use the entity names from the design exactly.`,
            "For each sprite: a vivid, specific visual description (silhouette, colors from the palette, key details, expression), its natural proportions as width/height (32–512, e.g. a car seen from above is tall, a bat is wide), and facing: the direction its front points (right for side-view, up for top-down things moving up the screen, down for things falling toward the player, none for symmetric items).",
            "No text, logos or UI in any sprite. No shadows under objects (the game draws them).",
            "environmentPrompt: a portrait background scene for the whole playfield (no characters, no text, calm center so gameplay stays readable).",
            "coverPrompt: an exciting cover-art scene with the player character in action.",
            'Return ONLY JSON: {"styleName","notes","palette":{...optional overrides},"deco":"stars|clouds|bubbles|dots|grid|hills|none","sprites":[{"name","description","width","height","facing"}],"environmentPrompt","coverPrompt"}'
          ].join("\n")
        },
        {
          role: "user",
          content: `GAME DESIGN:\n${JSON.stringify({ title: design.title, pitch: design.pitch, coreLoop: design.coreLoop, entities: design.entities, background: design.background })}`
        }
      ]
    });
    const known = new Map(design.entities.map((e) => [e.name, e]));
    let catalog = value.sprites
      .filter((s) => known.has(s.name))
      .map((s) => ({ ...s, role: known.get(s.name).role }));
    if (!catalog.some((s) => s.name === "player")) catalog.unshift(catalogFromDesign(design, 1)[0]);
    catalog = catalog.slice(0, Math.max(1, max));
    // Entities without art are still listed so the engineer knows their names.
    return {
      styleId,
      style: mergeStyle(styleId, value),
      catalog,
      environmentPrompt: value.environmentPrompt || design.background?.description || "",
      coverPrompt: value.coverPrompt || ""
    };
  },
  async fallback(ctx) {
    const design = ctx.out("design");
    const b = ctx.out("brief");
    return { styleId: b.style, style: mergeStyle(b.style, { deco: design.background?.deco }), catalog: catalogFromDesign(design, ctx.config.features.maxSprites), environmentPrompt: design.background?.description ?? "", coverPrompt: "" };
  }
};

// -------------------------------------------------------------- copywriter
export const copywriter = {
  retries: 0,
  timeoutMs: 90_000,
  async run(ctx) {
    const design = ctx.out("design");
    const { value } = await askJson({
      llm: ctx.llm, role: "copywriter", purpose: "copywriter", schema: Copy, maxTokens: 700, temperature: 0.6,
      messages: [
        { role: "system", content: 'Write store-listing copy for a mobile web game. Punchy, specific, no hype words like "ultimate". Return ONLY JSON: {"description" (2 sentences),"howToPlay" (1 sentence),"tags" (3-6 lowercase),"category" (one word)}' },
        { role: "user", content: JSON.stringify({ title: design.title, pitch: design.pitch, coreLoop: design.coreLoop, controls: design.controls }) }
      ]
    });
    return value;
  },
  async fallback(ctx) {
    const design = ctx.out("design");
    return { description: design.pitch || design.coreLoop, howToPlay: design.controls?.hint ?? "", tags: [design.recipe], category: "Arcade" };
  }
};

// ------------------------------------------------------------- edit router
export const editRouter = {
  retries: 0,
  timeoutMs: 2 * 60_000,
  async run(ctx) {
    const base = ctx.run.base;
    const { value } = await askJson({
      llm: ctx.llm, role: "editRouter", purpose: "editRouter", schema: EditPlan, maxTokens: 1500, temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "You route a creator's change request for an existing game to the right specialists.",
            "- code: true when gameplay, rules, controls, difficulty, UI text, or behavior must change. codeInstructions: precise instructions for the programmer.",
            "- sprites: list only sprites whose LOOK must change (use existing names; a new name only if the change adds a new visible entity), each with drawing instructions.",
            "- style: a new art style id only if the creator asks for a different overall look, else null. Style ids: " + Object.keys(STYLE_PRESETS).join(", "),
            "Change as little as possible. A pure art change must not touch code, and a pure gameplay change must not redraw art.",
            'Return ONLY JSON: {"summary","code":true|false,"codeInstructions","sprites":[{"name","instructions"}],"style":null}'
          ].join("\n")
        },
        {
          role: "user",
          content: `REQUEST: ${ctx.input.prompt}\n\nGAME: ${JSON.stringify({ title: base.design?.title, entities: base.design?.entities?.map((e) => ({ name: e.name, role: e.role, description: e.description })), sprites: base.art?.catalog?.map((s) => s.name) })}`
        }
      ]
    });
    return value;
  },
  async fallback(ctx) {
    return { summary: ctx.input.prompt, code: true, codeInstructions: ctx.input.prompt, sprites: [], style: null };
  }
};
