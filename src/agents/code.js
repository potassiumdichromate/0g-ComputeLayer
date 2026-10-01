import { engineApiReference } from "../runtime/bundle.js";
import { smokeTest } from "../qa/smoke.js";
import { recipeCode, getRecipe } from "../../recipes/index.js";
import { bestExample } from "../library/library.js";
import { effectiveArt } from "./art.js";

// Code agents.
//   engineer      — writes the game on the KULT Engine, adapting the closest
//                   tested recipe to the design (never from a blank page)
//   engineerEdit  — applies a change request to an existing game
//   codeQA        — headless acceptance test → targeted repair loop → known-good
//                   fallback, so a run can never ship a broken game

const HARD_RULES = [
  "HARD RULES:",
  "- Output ONLY JavaScript source. No markdown fences, no explanations, no import/export statements.",
  "- Start with `const g = KULT.game({...})`. Put per-run setup in g.setup, per-frame rules in g.update, collisions in g.onHit, spawning in g.every / g.after.",
  "- Keep ALL per-run state in g.data or inside setup, so restart resets everything.",
  "- Spawn entities using the design's entity names as the type (g.spawn(\"player\", ...)), so their sprites appear automatically. For sprite entities give only `h` so the width follows the art. ALSO give each a fitting `shape` and palette `color` (and `face: true` for creatures) so it still looks good as a shape.",
  "- Use palette keys (primary, secondary, accent, danger, good, text, bg1, bg2) for every color. Do not pass palette, style or font to KULT.game. Only pass background.deco if the design's background calls for one.",
  "- Fully playable by touch alone. The `hint` explains the controls in one short sentence.",
  "- Size for a phone: the player sprite is 64–96 px tall, enemies/hazards/collectibles 40–72 px, so the art reads clearly. Never draw sprites under 32 px.",
  "- Games are portrait and fill a phone screen: do NOT pass `orientation` to KULT.game. Lay everything out relative to g.W (360) and g.H.",
  "- Difficulty must escalate over time (g.ramp, g.every with a function, g.nextLevel()).",
  "- Juice every key moment: burst particles on collect/destroy, shake on damage, g.addScore with coordinates for floating text, a g.sfx for every event.",
  "- Nothing may pile up forever: give spawned objects a ttl, bounds \"kill\", or kill them.",
  "- Guard against undefined values (entities can be dead: check `e.dead`).",
  "- Complete code, no TODOs, no placeholder logic, roughly 150–450 lines."
].join("\n");

function stripFence(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```(?:js|javascript)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

// 24K leaves room for the model's hidden thinking plus a full game.
async function writeCode(ctx, { role, purpose, system, user, maxTokens = 24000 }) {
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  const first = await ctx.llm.chat({ role, purpose, messages, maxTokens, temperature: 0.4, timeoutMs: 12 * 60_000, retries: 1 });
  if (first.finishReason !== "length") return { code: stripFence(first.content), model: first.model };
  // Cut off at the token cap: ask for the rest once and join.
  const rest = await ctx.llm.chat({
    role, purpose, maxTokens, temperature: 0.4, timeoutMs: 12 * 60_000, retries: 1,
    messages: [...messages, { role: "assistant", content: first.content }, { role: "user", content: "You were cut off. Continue EXACTLY where you stopped. Output only the remaining code, no repetition, no fences." }]
  });
  return { code: stripFence(first.content + rest.content), model: first.model };
}

function catalogTable(art, assets) {
  const catalog = assets?.catalog?.length ? assets.catalog : art.catalog;
  if (!catalog?.length) return "(no sprites — draw everything with shapes and palette colors)";
  return catalog.map((c) => `- ${c.name} (${c.role ?? c.kind ?? "prop"}): ${c.width ?? 256}x${c.height ?? 256}, faces ${c.facing ?? "none"} — ${String(c.description ?? "").slice(0, 160)}`).join("\n");
}

// Deterministic last resort: the seed recipe, re-titled for this design.
export function recipeFallbackCode(recipeId, design) {
  const safe = (s) => String(s ?? "").replace(/["\\\n\r]/g, " ").slice(0, 120);
  let code = recipeCode(recipeId);
  if (design?.title) code = code.replace(/title:\s*"[^"]*"/, `title: "${safe(design.title)}"`);
  if (design?.controls?.hint) code = code.replace(/hint:\s*"[^"]*"/, `hint: "${safe(design.controls.hint)}"`);
  return code;
}

// ----------------------------------------------------------------- engineer
export const engineer = {
  retries: 0,
  timeoutMs: 25 * 60_000,
  async run(ctx) {
    const design = ctx.out("design");
    const art = ctx.out("art");
    const recipe = getRecipe(design.recipe) ?? getRecipe("runner");
    const example = await bestExample(recipe.id).catch(() => null);
    const system = [
      "You are a senior mobile game developer at a studio that ships polished, addictive casual games.",
      "You write game code on top of the KULT Engine, which already handles the canvas, input, menus, restart, HUD, particles, sound and sprites. Your job is the GAME: its rules, feel and escalation.",
      "",
      engineApiReference(),
      "",
      HARD_RULES
    ].join("\n");
    const user = [
      "GAME DESIGN — implement ALL of it (every entity, rule, scoring rule, progression step and juice moment):",
      JSON.stringify(design, null, 1),
      "",
      "ART CATALOG — these sprites exist at runtime under exactly these names:",
      catalogTable(art),
      "Entities not listed are drawn as shapes: choose a fitting shape and palette color.",
      "",
      `SEED — a tested, working ${recipe.name} game on the same engine [[recipe:${recipe.id}]]. Keep its proven structure (restart-safe state, spawn timers, cleanup, collision handling) and transform it into the design above: rename entities to the design's names, implement the design's rules, tuning, scoring, progression, title and hint. Remove anything the design does not have.`,
      "```js",
      recipeCode(recipe.id),
      "```",
      example ? `\nA highly rated game of the same family from this studio (for quality reference only, do not copy its theme):\n\`\`\`js\n${example.code.slice(0, 14000)}\n\`\`\`` : "",
      "",
      "Write the complete game now."
    ].join("\n");
    const { code, model } = await writeCode(ctx, { role: "engineer", purpose: "engineer", system, user });
    if (!/KULT\.game\s*\(/.test(code)) throw new Error("Engineer output does not create a KULT game");
    return { code, model, seed: recipe.id, source: "engineer" };
  },
  async fallback(ctx) {
    const design = ctx.out("design");
    return { code: recipeFallbackCode(design.recipe, design), model: null, seed: design.recipe, source: "recipe-fallback" };
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

export const codeQA = {
  retries: 0,
  timeoutMs: 30 * 60_000,
  async run(ctx) {
    const from = ctx.out(ctx.params.from ?? "code");
    const design = ctx.out("design");
    const gamePackage = gamePackageForTest(ctx);
    let code = from.code;
    let report = smokeTest(code, { gamePackage });
    const history = [{ attempt: 0, ok: report.ok, failures: report.failures, warnings: report.warnings }];
    let source = from.source;
    const maxAttempts = Math.max(0, ctx.config.features.repairAttempts);

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
          "FAILURES (must fix):", ...report.failures.map((f) => `- ${f}`),
          report.warnings.length ? "WARNINGS (fix if simple):\n" + report.warnings.map((w) => `- ${w}`).join("\n") : "",
          "", "CODE:", "```js", code, "```"
        ].join("\n")
      }).catch((error) => ({ error }));
      if (reply.error) { history.push({ attempt, error: reply.error.message }); break; }
      const next = smokeTest(reply.code, { gamePackage });
      history.push({ attempt, ok: next.ok, failures: next.failures, warnings: next.warnings });
      // Only keep a repair that is actually better.
      if (severity(next) < severity(report)) { code = reply.code; report = next; source = "repaired"; }
    }

    if (!report.ok) {
      // Ship a known-good game rather than a broken one; say so loudly. For an
      // edit, the known-good game is the version before the edit.
      const isEdit = ctx.run.kind === "edit";
      const fallback = isEdit ? ctx.run.base.gameCode : recipeFallbackCode(design.recipe, design);
      const fbReport = smokeTest(fallback, { gamePackage });
      return { code: fallback, source: isEdit ? "edit-reverted" : "recipe-fallback", report: fbReport, rejected: { failures: report.failures }, history };
    }
    return { code, source, report, history };
  }
};
