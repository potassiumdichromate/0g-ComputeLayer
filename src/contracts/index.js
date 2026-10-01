import { z } from "zod";

// Typed artifacts passed between agents. Agents never hand each other free
// text: every LLM reply is parsed into one of these, and anything that does not
// validate is sent back to the model (see llm/json.js) or replaced by a
// deterministic fallback. Schemas are lenient on shape (.catch defaults) and
// strict on meaning (names, enums, ranges).

const snake = z.string().transform((s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32)).pipe(z.string().min(1));
const text = (max = 600) => z.coerce.string().transform((s) => s.slice(0, max));
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const ROLES = ["player", "enemy", "obstacle", "hazard", "collectible", "powerup", "projectile", "platform", "prop"];
export const DECOS = ["stars", "clouds", "bubbles", "dots", "grid", "hills", "none"];

export const Brief = z.object({
  title: text(60).catch("Untitled Game"),
  pitch: text(300).catch(""),
  genre: text(60).catch("arcade"),
  recipe: z.string().catch("runner"),
  style: z.string().catch("cartoon"),
  orientation: z.enum(["portrait", "landscape"]).catch("portrait")
});

export const DesignEntity = z.object({
  name: snake,
  role: z.enum(ROLES).catch("prop"),
  description: text(400).catch(""),
  behavior: text(300).catch(""),
  spawn: text(300).catch(""),
  interaction: text(300).catch(""),
  size: z.coerce.number().min(8).max(240).catch(40),
  needsSprite: z.boolean().catch(true)
});

export const GameDesign = z.object({
  title: text(60),
  pitch: text(300).catch(""),
  recipe: z.string().catch(""),
  orientation: z.enum(["portrait", "landscape"]).catch("portrait"),
  controls: z.object({ touch: text(200).catch(""), keyboard: text(200).catch(""), hint: text(140).catch("") }),
  coreLoop: text(500).catch(""),
  entities: z.array(DesignEntity).min(1).max(12),
  rules: z.array(text(240)).max(16).catch([]),
  scoring: z.array(text(200)).max(8).catch([]),
  lives: z.coerce.number().int().min(0).max(9).catch(3),
  progression: z.array(text(200)).max(8).catch([]),
  winCondition: text(200).nullable().catch(null),
  loseCondition: text(200).catch("Run out of lives"),
  tuning: z.record(z.coerce.number()).catch({}),
  juice: z.array(text(160)).max(12).catch([]),
  background: z.object({ description: text(300).catch(""), deco: z.enum(DECOS).catch("stars") }).catch({ description: "", deco: "stars" })
}).transform((d) => {
  // Exactly one entity named "player" with the player role.
  const seen = new Set();
  let entities = d.entities.filter((e) => (seen.has(e.name) ? false : seen.add(e.name)));
  const player = entities.find((e) => e.name === "player") ?? entities.find((e) => e.role === "player");
  if (player) { player.name = "player"; player.role = "player"; }
  else entities = [{ name: "player", role: "player", description: "the player character", behavior: "", spawn: "", interaction: "", size: 48, needsSprite: true }, ...entities];
  entities = entities.map((e) => (e.name !== "player" && e.role === "player" ? { ...e, role: "prop" } : e));
  return { ...d, entities };
});

export const ArtDirection = z.object({
  styleName: text(60).catch(""),
  notes: text(600).catch(""),
  palette: z.object({
    bg1: hex.optional().catch(undefined), bg2: hex.optional().catch(undefined), primary: hex.optional().catch(undefined),
    secondary: hex.optional().catch(undefined), accent: hex.optional().catch(undefined), danger: hex.optional().catch(undefined),
    good: hex.optional().catch(undefined), text: hex.optional().catch(undefined)
  }).partial().catch({}),
  deco: z.enum(DECOS).optional().catch(undefined),
  sprites: z.array(z.object({
    name: snake,
    description: text(500).catch(""),
    width: z.coerce.number().min(32).max(512).catch(256),
    height: z.coerce.number().min(32).max(512).catch(256),
    facing: z.enum(["right", "left", "up", "down", "none"]).catch("right")
  })).max(12).catch([]),
  environmentPrompt: text(600).catch(""),
  coverPrompt: text(600).catch("")
});

export const JudgeVerdict = z.object({
  pass: z.boolean().catch(false),
  scores: z.object({
    visuals: z.coerce.number().min(0).max(10).catch(5),
    readability: z.coerce.number().min(0).max(10).catch(5),
    fidelity: z.coerce.number().min(0).max(10).catch(5)
  }).catch({ visuals: 5, readability: 5, fidelity: 5 }),
  issues: z.array(text(300)).max(8).catch([])
});

export const Copy = z.object({
  description: text(400).catch(""),
  howToPlay: text(300).catch(""),
  tags: z.array(text(24)).max(8).catch([]),
  category: text(30).catch("Arcade")
});

export const EditPlan = z.object({
  summary: text(300).catch(""),
  code: z.boolean().catch(true),
  codeInstructions: text(1500).catch(""),
  sprites: z.array(z.object({ name: snake, instructions: text(500).catch("") })).max(8).catch([]),
  style: z.string().nullable().catch(null)
});
