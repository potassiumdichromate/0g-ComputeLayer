import { Brief, GameDesign, ArtDirection, Copy, EditPlan } from "../contracts/index.js";
import { askJson } from "../llm/json.js";
import { listRecipes, getRecipe, matchRecipe, recipeCode } from "../../recipes/index.js";
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
  "Anything else (grids, custom rules, special abilities, bosses, power-ups, timers) is written as game logic on top."
].join("\n");

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
  retries: 0,
  timeoutMs: 90_000,
  async run(ctx) {
    const { prompt } = ctx.input;
    const forcedStyle = getStyle(ctx.input.style) ? ctx.input.style : null;
    const { value } = await askJson({
      llm: ctx.llm, role: "brief", purpose: "brief", schema: Brief, maxTokens: 900, temperature: 0.3,
      messages: [
        {
          role: "system",
          content: [
            "You are the producer of a mobile web-game studio. Read a one-line game idea and route it.",
            "Choose the recipe whose CORE PLAYER ACTION is closest to the idea (mechanic fit beats theme words).",
            "Choose the art style that best fits the theme" + (forcedStyle ? ` — the creator already picked "${forcedStyle}", use it.` : "."),
            "Invent a short, catchy, ORIGINAL title (max 4 words; never reuse a famous game's name).",
            'Return ONLY JSON: {"title","pitch" (one exciting sentence),"genre","recipe","style","orientation":"portrait"|"landscape"}',
            "Recipes:",
            ...listRecipes().map((r) => `- ${r.id}: ${r.name} — ${r.summary}`),
            "Styles:",
            ...listStyles().map((s) => `- ${s.id}: ${s.description}`),
            "Use portrait unless the idea clearly needs a wide screen."
          ].join("\n")
        },
        { role: "user", content: `PROMPT:\n${prompt}\n\n` }
      ]
    });
    return {
      ...value,
      recipe: getRecipe(value.recipe) ? value.recipe : matchRecipe(prompt).id,
      style: forcedStyle ?? (getStyle(value.style) ? value.style : inferStyle(prompt))
    };
  },
  async fallback(ctx) {
    const { prompt } = ctx.input;
    return {
      title: titleFromPrompt(prompt), pitch: String(prompt).slice(0, 200), genre: "arcade",
      recipe: matchRecipe(prompt).id,
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
    const recipe = getRecipe(b.recipe);
    const { value } = await askJson({
      llm: ctx.llm, role: "designer", purpose: "designer", schema: GameDesign, maxTokens: 3500, temperature: 0.55,
      messages: [
        {
          role: "system",
          content: [
            "You are the lead game designer of a studio famous for instantly fun, polished mobile games.",
            "Turn the brief into a complete, BUILDABLE game design document. The programmer implements exactly what you write, so be concrete: numbers, counts, speeds, timings.",
            "Design principles you always follow:",
            "- The core action is understood in 3 seconds and feels good on the first tap.",
            "- Clear goal, clear failure, and a reason to try again (score chase, near misses, combos).",
            "- Risk vs reward: the best rewards sit next to danger.",
            "- Difficulty escalates in concrete steps (speed, spawn rate, new enemy types) — list them in progression.",
            "- 3 to 7 entities total. Every entity has a distinct role, look, and interaction. Name them in snake_case, and the controlled character MUST be named \"player\".",
            "- Only design what the engine + a few hundred lines of game logic can build well. Mechanic family to build on:",
            `  ${recipe.id}: ${recipe.summary}`,
            `  Its tunable parameters today: ${tuningKeys(recipe.id) || "(free)"}`,
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
            `PROMPT:\n${ctx.input.prompt}\n`,
            `BRIEF: ${JSON.stringify({ title: b.title, pitch: b.pitch, genre: b.genre, orientation: b.orientation })}`,
            `Recipe to build on: ${recipe.id} [[recipe:${recipe.id}]]`,
            "Keep the title from the brief unless it is weak."
          ].join("\n")
        }
      ]
    });
    return { ...value, recipe: recipe.id };
  },
  async fallback(ctx) {
    const b = ctx.out("brief");
    return defaultDesign(b, ctx.input.prompt);
  }
};

export function defaultDesign(b, prompt) {
  const recipe = getRecipe(b.recipe) ?? getRecipe("runner");
  const types = [...new Set([...recipeCode(recipe.id).matchAll(/spawn\("([a-z_]+)"/g)].map((m) => m[1]))];
  const structural = new Set(["gate", "platform", "bullet", "enemy_bullet", "brick", "paddle", "ball"]);
  return GameDesign.parse({
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
  });
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
