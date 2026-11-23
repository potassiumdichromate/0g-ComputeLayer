import { engineApiReference } from "../runtime/bundle.js";
import { smokeTest } from "../qa/smoke.js";
import { recipeCode, getRecipe, scoreRecipe } from "../../recipes/index.js";
import { bestExample } from "../library/library.js";
import { effectiveArt } from "./art.js";
import { FidelityVerdict } from "../contracts/index.js";
import { askJson } from "../llm/json.js";

// Code agents.
//   engineer      — writes the game on the KULT Engine. When a tested recipe IS
//                   the requested game (fit exact/close) it adapts that recipe;
//                   otherwise it writes the game from scratch, with a recipe
//                   shown only as an example of engine idioms
//   engineerEdit  — applies a change request to an existing game
//   codeQA        — headless acceptance test → targeted repair loop → fidelity
//                   review (does the code implement what the creator ASKED
//                   for?) → rewrite when it does not. It never ships a
//                   different game: the recipe fallback is used only when the
//                   recipe is the requested game, otherwise the run fails
//                   honestly (Kult Create refunds the credits).

const HARD_RULES = [
  "HARD RULES:",
  "- Output ONLY JavaScript source. No markdown fences, no explanations, no import/export statements.",
  "- Start with `const g = KULT.game({...})`. Put per-run setup in g.setup, per-frame rules in g.update, collisions in g.onHit, spawning in g.every / g.after.",
  "- Keep ALL per-run state in g.data or inside setup, so restart resets everything.",
  "- Spawn entities using the design's entity names as the type (g.spawn(\"player\", ...)), so their sprites appear automatically. For sprite entities give only `h` so the width follows the art. ALSO give each a fitting `shape` and palette `color` (and `face: true` for creatures) so it still looks good as a shape.",
  "- Use palette keys (primary, secondary, accent, danger, good, text, bg1, bg2) for every color. Do not pass palette, style or font to KULT.game. Only pass background.deco if the design's background calls for one.",
  "- Fully playable by touch alone. The `hint` explains the controls in one short sentence.",
  "- Things you draw yourself in g.draw / g.drawBehind (boards, tiles, cards, gems, UI pieces) must use the generated art: call g.sprite(catalogName, x, y, w, h) first and draw a shape only when it returns false.",
  "- Size for a phone: the player sprite is 64–96 px tall, enemies/hazards/collectibles 40–72 px, so the art reads clearly. Never draw sprites under 32 px. Board/grid games size cells with g.grid so the board fits the screen.",
  "- Games are portrait and fill a phone screen: do NOT pass `orientation` to KULT.game. Lay everything out relative to g.W (360) and g.H. Keep text and buttons inside the screen and never overlapping each other.",
  "- Difficulty must escalate over time or by level (g.ramp, g.every with a function, g.nextLevel(), a stronger AI).",
  "- Juice every key moment: burst particles on collect/destroy, shake on damage, g.addScore with coordinates for floating text, a g.sfx for every event.",
  "- Nothing may pile up forever: give spawned objects a ttl, bounds \"kill\", or kill them.",
  "- Guard against undefined values (entities can be dead: check `e.dead`). Any search (AI lookahead, flood fill, path finding) must be bounded so one frame stays well under 100 ms.",
  "- Complete code, no TODOs, no placeholder logic."
].join("\n");

const FROM_SCRATCH_RULES = [
  "BUILDING FROM SCRATCH:",
  "- Implement THE GAME THE CREATOR ASKED FOR, completely. If it is a known game, every real rule works (all piece/card/move types, special rules, scoring, win/lose/draw conditions). Never substitute a simpler or different game.",
  "- Two-player games get a computer opponent with a real strategy (minimax/heuristics) that gets stronger with each level; the opponent's turn waits ~0.4 s so the player sees it.",
  "- Turn-based, board and puzzle games: tap-to-select + highlighted legal targets, clear status text (whose turn, check, invalid move), animated moves, an UNDO button where it is natural. Rounds/levels: g.nextLevel() on a win, g.over({ title }) or g.loseLife() on a loss.",
  "- Lay out with g.grid + g.button + g.panel + g.text; draw pieces/cards with g.sprite first and crisp vector shapes or glyphs as the fallback.",
  "- Typically 250–700 lines. Correctness of the rules beats decoration."
].join("\n");

function stripFence(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```(?:js|javascript)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

async function writeCode(ctx, { role, purpose, system, user, maxTokens = 32000 }) {
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  const first = await ctx.llm.chat({ role, purpose, messages, maxTokens, temperature: 0.35, timeoutMs: 15 * 60_000, retries: 1 });
  if (first.finishReason !== "length") return { code: stripFence(first.content), model: first.model };
  // Cut off at the token cap: ask for the rest once and join.
  const rest = await ctx.llm.chat({
    role, purpose, maxTokens, temperature: 0.35, timeoutMs: 15 * 60_000, retries: 1,
    messages: [...messages, { role: "assistant", content: first.content }, { role: "user", content: "You were cut off. Continue EXACTLY where you stopped. Output only the remaining code, no repetition, no fences." }]
  });
  return { code: stripFence(first.content + rest.content), model: first.model };
}

function catalogTable(art, assets) {
  const catalog = assets?.catalog?.length ? assets.catalog : art.catalog;
  if (!catalog?.length) return "(no sprites — draw everything with shapes and palette colors)";
  return catalog.map((c) => `- ${c.name} (${c.role ?? c.kind ?? "prop"}): ${c.width ?? 256}x${c.height ?? 256}, faces ${c.facing ?? "none"} — ${String(c.description ?? "").slice(0, 160)}`).join("\n");
}

// What the creator asked for, as every code agent sees it.
function requestBlock(ctx, design) {
  return [
    `CREATOR'S REQUEST (the contract — the game must be this): ${ctx.input.prompt}`,
    design?.knownGame ? `This is ${design.knownGame}: its real rules, complete.` : "",
    design?.coreActions ? `Core player actions: ${design.coreActions}` : ""
  ].filter(Boolean).join("\n");
}

// Deterministic last resort: the seed recipe, re-titled for this design.
export function recipeFallbackCode(recipeId, design) {
  const safe = (s) => String(s ?? "").replace(/["\\\n\r]/g, " ").slice(0, 120);
  let code = recipeCode(recipeId);
  if (design?.title) code = code.replace(/title:\s*"[^"]*"/, `title: "${safe(design.title)}"`);
  if (design?.controls?.hint) code = code.replace(/hint:\s*"[^"]*"/, `hint: "${safe(design.controls.hint)}"`);
  return code;
}

// A recipe can stand in for the game only when it IS the requested game.
const recipeIsTheGame = (design) => Boolean(design?.recipe && design.fit === "exact" && getRecipe(design.recipe));

// For a from-scratch build: a working game that shows engine idioms for this
// kind of game (board/turn games vs real-time action).
function idiomReference(ctx, design) {
  const text = `${ctx.input.prompt} ${design.coreLoop ?? ""} ${(design.rules ?? []).join(" ")}`.toLowerCase();
  const boardish = /\b(board|grid|tile|cell|card|deck|turn|puzzle|piece|word|letter|move|opponent|cpu|ai)\b/.test(text);
  const scored = scoreRecipe(ctx.input.prompt);
  if (boardish) return getRecipe("chess") ? "chess" : "sokoban";
  return scored.score > 0 ? scored.recipe.id : "runner";
}

function engineerPrompts(ctx, design, art, example) {
  const recipe = design.recipe && design.fit !== "none" ? getRecipe(design.recipe) : null;
  const system = [
    "You are a senior mobile game developer at a studio that ships polished, addictive casual games.",
    "You write game code on top of the KULT Engine, which already handles the canvas, input, menus, restart, HUD, particles, sound and sprites. Your job is the GAME: its rules, feel and escalation.",
    "",
    engineApiReference(),
    "",
    HARD_RULES,
    recipe ? "" : `\n${FROM_SCRATCH_RULES}`
  ].join("\n");
  const user = [
    requestBlock(ctx, design),
    "",
    "GAME DESIGN — implement ALL of it (every entity, rule, scoring rule, progression step and juice moment):",
    JSON.stringify(design, null, 1),
    "",
    "ART CATALOG — these sprites exist at runtime under exactly these names:",
    catalogTable(art),
    "Entities not listed are drawn as shapes: choose a fitting shape and palette color.",
    ""
  ];
  if (recipe && design.fit === "exact") {
    user.push(
      `SEED — our tested, working ${recipe.name} game [[recipe:${recipe.id}]]. It already IS the requested game with correct rules: keep its rules, structure and AI intact, and change only what the design asks for (title, hint, theme, names, colors, tuning, extra juice, art hookups).`,
      "```js", recipeCode(recipe.id), "```"
    );
  } else if (recipe) {
    user.push(
      `SEED — a tested, working ${recipe.name} game on the same engine with the same core action [[recipe:${recipe.id}]]. Keep its proven structure (restart-safe state, spawn timers, cleanup, collision handling) and transform it into the design above: rename entities to the design's names, implement the design's rules, tuning, scoring, progression, title and hint. Where the request differs from the seed, the REQUEST wins.`,
      "```js", recipeCode(recipe.id), "```"
    );
  } else {
    const ref = idiomReference(ctx, design);
    user.push(
      `ENGINE IDIOMS — a working game of a DIFFERENT kind, shown ONLY so you see how this engine is used (grid, taps, buttons, turn flow, drawing). Do NOT copy its gameplay, rules or theme [[reference:${ref}]]:`,
      "```js", recipeCode(ref), "```"
    );
  }
  if (example) user.push(`\nA highly rated game of the same family from this studio (for quality reference only, do not copy its theme):\n\`\`\`js\n${example.code.slice(0, 14000)}\n\`\`\``);
  user.push("", "Write the complete game now.");
  return { system, user: user.join("\n") };
}

// ----------------------------------------------------------------- engineer
export const engineer = {
  retries: 0,
  timeoutMs: 30 * 60_000,
  async run(ctx) {
    const design = ctx.out("design");
    const art = ctx.out("art");
    const recipeId = design.recipe && design.fit !== "none" ? design.recipe : null;
    const example = recipeId ? await bestExample(recipeId).catch(() => null) : null;
    const { system, user } = engineerPrompts(ctx, design, art, example);
    const { code, model } = await writeCode(ctx, { role: "engineer", purpose: "engineer", system, user });
    if (!/KULT\.game\s*\(/.test(code)) throw new Error("Engineer output does not create a KULT game");
    return { code, model, seed: recipeId, source: recipeId ? "engineer" : "engineer-scratch" };
  },
  async fallback(ctx, error) {
    const design = ctx.out("design");
    if (recipeIsTheGame(design)) return { code: recipeFallbackCode(design.recipe, design), model: null, seed: design.recipe, source: "recipe-fallback" };
    // A second engineer (the repair model) writes it instead of shipping a different game.
    const { system, user } = engineerPrompts(ctx, design, ctx.out("art"), null);
    const { code, model } = await writeCode(ctx, { role: "repair", purpose: "engineer", system, user });
    if (!/KULT\.game\s*\(/.test(code)) throw new Error(`The engineers could not write this game (${error?.message ?? "no code"})`);
    return { code, model, seed: null, source: "engineer-backup" };
  }
};

// ------------------------------------------------------------ engineer edit
export const engineerEdit = {
  retries: 0,
  timeoutMs: 20 * 60_000,
  async run(ctx) {
    const plan = ctx.out("edit-plan");
    const baseCode = ctx.run.base.gameCode;
    if (!plan.code) return { code: baseCode, source: "unchanged", seed: ctx.run.base.design?.recipe };
    const art = effectiveArt(ctx);
    const newSprites = (ctx.out("edit-sprites")?.targets ?? []).map((t) => t.name);
    const system = [
      "You are the developer maintaining a KULT Engine game. Apply the requested change precisely.",
      "", engineApiReference(), "", HARD_RULES,
      "- This is an EDIT: keep every working mechanic, entity, and feature that the request does not mention. Return the complete updated game."
    ].join("\n");
    const user = [
      `CHANGE REQUEST: ${ctx.input.prompt}`,
      `PRODUCER'S INSTRUCTIONS: ${plan.codeInstructions}`,
      newSprites.length ? `Sprites being (re)drawn for this change: ${newSprites.join(", ")} — spawn entities with these names so the art is used.` : "",
      "ART CATALOG:", catalogTable(art, ctx.run.base.assets),
      "CURRENT GAME CODE:", "```js", baseCode, "```"
    ].join("\n");
    const { code, model } = await writeCode(ctx, { role: "engineer", purpose: "engineerEdit", system, user });
    if (!/KULT\.game\s*\(/.test(code)) throw new Error("Edit output does not create a KULT game");
    return { code, model, seed: ctx.run.base.design?.recipe, source: "edit" };
  },
  async fallback(ctx) {
    return { code: ctx.run.base.gameCode, model: null, seed: ctx.run.base.design?.recipe, source: "unchanged" };
  }
};

// ------------------------------------------------------------------ code QA
function gamePackageForTest(ctx) {
  const design = ctx.out("design");
  const art = effectiveArt(ctx);
  return { title: design?.title, style: art?.style ? { palette: art.style.palette, outline: art.style.outline, outlineWidth: art.style.outlineWidth, radius: art.style.radius, font: art.style.font, deco: art.style.deco } : undefined };
}

const severity = (report) => report.failures.length * 10 + report.warnings.length;
// Failures that make a game unplayable (as opposed to restart/menu quirks).
const FATAL = /Syntax error|throws while loading|never called KULT\.game|did not enter play|Frame crashed|took more than|Runtime error|Expected the start menu|exploded/;
const isPlayable = (report) => report.failures.every((f) => !FATAL.test(f));

// Reads the code and judges whether it implements what the creator asked for.
export async function reviewFidelity(ctx, code, { design, request } = {}) {
  const isEdit = Boolean(request);
  const { value } = await askJson({
    llm: ctx.llm, role: "judge", purpose: "fidelity", schema: FidelityVerdict, maxTokens: 6000, temperature: 0.1,
    messages: [
      {
        role: "system",
        content: [
          "You are the lead reviewer of a game studio. You read a game's source code (KULT Engine, a 2D canvas engine) and judge whether it delivers what the creator asked for.",
          isEdit
            ? "The creator asked for a CHANGE to an existing game. matches = true only if the change is really implemented and working."
            : "matches = true only if a player would immediately recognise this as the game the creator asked for: the same kind of game, its core actions, and — for a known game — its real rules, all working. A different genre wearing the requested theme is a hard false (e.g. a request for chess that is an HP battle).",
          "score 0-10 for faithfulness and completeness. gameIs: one sentence describing what this code actually is when played.",
          "missing: concrete requested mechanics/rules that are absent or wrong. bugs: logic errors that break the core game (illegal states, impossible to win, unreachable code paths, opponent never moves, controls that do nothing).",
          'Reply ONLY with JSON: {"matches":true|false,"score":0-10,"gameIs":"…","missing":["…"],"bugs":["…"]}'
        ].join("\n")
      },
      {
        role: "user",
        content: [
          isEdit ? `CHANGE REQUEST: ${request}` : requestBlock(ctx, design),
          design ? `DESIGN SUMMARY: ${JSON.stringify({ title: design.title, coreLoop: design.coreLoop, rules: design.rules, winCondition: design.winCondition, loseCondition: design.loseCondition })}` : "",
          "CODE:", "```js", String(code).slice(0, 60000), "```"
        ].filter(Boolean).join("\n")
      }
    ]
  });
  return value;
}

async function rewriteForFidelity(ctx, code, verdict, { design, request }) {
  const reply = await writeCode(ctx, {
    role: "engineer",
    purpose: "fidelity-fix",
    system: [
      "You are the senior developer of a KULT Engine game. A reviewer found that the game does not deliver what the creator asked for. Fix that: implement every missing mechanic and rule, fix every listed bug, keep everything that already works. Return the COMPLETE corrected game code only.",
      "", engineApiReference(), "", HARD_RULES, design && !design.recipe ? `\n${FROM_SCRATCH_RULES}` : ""
    ].join("\n"),
    user: [
      request ? `CHANGE REQUEST: ${request}` : requestBlock(ctx, design),
      `REVIEW: the game currently is: ${verdict.gameIs}`,
      verdict.missing.length ? "MISSING / WRONG:\n" + verdict.missing.map((m) => `- ${m}`).join("\n") : "",
      verdict.bugs.length ? "BUGS:\n" + verdict.bugs.map((m) => `- ${m}`).join("\n") : "",
      "", "CODE:", "```js", code, "```"
    ].filter(Boolean).join("\n")
  });
  return reply.code;
}

const passesFidelity = (v) => v.matches && v.score >= 7;

export const codeQA = {
  retries: 0,
  timeoutMs: 45 * 60_000,
  async run(ctx) {
    const from = ctx.out(ctx.params.from ?? "code");
    const design = ctx.out("design");
    const isEdit = ctx.run.kind === "edit";
    const gamePackage = gamePackageForTest(ctx);
    let code = from.code;
    let report = smokeTest(code, { gamePackage });
    const history = [{ attempt: 0, ok: report.ok, failures: report.failures, warnings: report.warnings }];
    let source = from.source;
    const maxAttempts = Math.max(0, ctx.config.features.repairAttempts);

    const repairLoop = async (label) => {
      for (let attempt = 1; attempt <= maxAttempts && !report.ok; attempt += 1) {
        ctx.progress({ stage: "repairing", attempt, failures: report.failures.length });
        const reply = await writeCode(ctx, {
          role: "repair",
          purpose: "repair",
          system: [
            "You fix KULT Engine games that failed automated acceptance tests (a bot starts the game, plays it with taps, swipes and keys, lets it end, and restarts it).",
            "Fix exactly the listed failures. Keep every mechanic, entity, and design decision. Return the COMPLETE corrected game code only.",
            "", engineApiReference(), "", HARD_RULES
          ].join("\n"),
          user: [
            isEdit ? `CHANGE REQUEST: ${ctx.input.prompt}` : requestBlock(ctx, design),
            "FAILURES (must fix):", ...report.failures.map((f) => `- ${f}`),
            report.warnings.length ? "WARNINGS (fix if simple):\n" + report.warnings.map((w) => `- ${w}`).join("\n") : "",
            "", "CODE:", "```js", code, "```"
          ].join("\n")
        }).catch((error) => ({ error }));
        if (reply.error) { history.push({ attempt, stage: label, error: reply.error.message }); break; }
        const next = smokeTest(reply.code, { gamePackage });
        history.push({ attempt, stage: label, ok: next.ok, failures: next.failures, warnings: next.warnings });
        // Only keep a repair that is actually better.
        if (severity(next) < severity(report)) { code = reply.code; report = next; source = "repaired"; }
      }
    };

    await repairLoop("acceptance");

    // Still failing and the recipe is not the requested game: one fresh build
    // by the repair model (the design, not the broken code) before giving up.
    if (!report.ok && !isEdit && !recipeIsTheGame(design) && !isPlayable(report)) {
      ctx.progress({ stage: "rebuilding" });
      const { system, user } = engineerPrompts(ctx, design, effectiveArt(ctx), null);
      const fresh = await writeCode(ctx, { role: "repair", purpose: "engineer", system, user }).catch((error) => ({ error }));
      if (!fresh.error && /KULT\.game\s*\(/.test(fresh.code)) {
        const next = smokeTest(fresh.code, { gamePackage });
        history.push({ attempt: "rebuild", ok: next.ok, failures: next.failures });
        if (severity(next) < severity(report)) { code = fresh.code; report = next; source = "rebuilt"; }
        await repairLoop("rebuild");
      }
    }

    // Fidelity: does it deliver what was asked? One or two targeted rewrites.
    let fidelity = null;
    const passes = Math.max(0, ctx.config.features.fidelityPasses ?? 1);
    if (isPlayable(report) && passes > 0 && !(source === "recipe-fallback")) {
      const opts = isEdit ? { request: ctx.input.prompt } : { design };
      fidelity = await reviewFidelity(ctx, code, opts).catch((error) => ({ error: error.message }));
      history.push({ attempt: "fidelity", verdict: fidelity });
      for (let pass = 1; pass <= passes && fidelity && !fidelity.error && !passesFidelity(fidelity); pass += 1) {
        ctx.progress({ stage: "matching the request", pass, missing: fidelity.missing.length });
        const fixed = await rewriteForFidelity(ctx, code, fidelity, opts).catch(() => null);
        if (!fixed || !/KULT\.game\s*\(/.test(fixed)) break;
        const next = smokeTest(fixed, { gamePackage });
        if (!isPlayable(next) || severity(next) > severity(report) + 10) { history.push({ attempt: `fidelity-fix-${pass}`, rejected: next.failures }); continue; }
        const after = await reviewFidelity(ctx, fixed, opts).catch(() => null);
        history.push({ attempt: `fidelity-fix-${pass}`, verdict: after, ok: next.ok });
        if (after && after.score >= fidelity.score) { code = fixed; report = next; fidelity = after; source = "fidelity-fixed"; }
      }
    }

    if (!report.ok) {
      if (isEdit) {
        if (isPlayable(report)) return { code, source, report, history, fidelity };
        const fbReport = smokeTest(ctx.run.base.gameCode, { gamePackage });
        return { code: ctx.run.base.gameCode, source: "edit-reverted", report: fbReport, rejected: { failures: report.failures }, history };
      }
      if (recipeIsTheGame(design)) {
        const fallback = recipeFallbackCode(design.recipe, design);
        return { code: fallback, source: "recipe-fallback", report: smokeTest(fallback, { gamePackage }), rejected: { failures: report.failures }, history };
      }
      // Playable with minor quirks (e.g. restart): ship it and say so.
      if (isPlayable(report)) return { code, source, report, history, fidelity, quirks: report.failures };
      throw Object.assign(new Error(`Could not build a working version of this game (${report.failures.slice(0, 2).join("; ")})`), { history });
    }
    return { code, source, report, history, fidelity };
  }
};
