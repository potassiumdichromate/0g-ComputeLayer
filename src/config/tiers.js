// Per-tier agent roster. Every model role can be overridden from the
// environment with AGENT_<ROLE>_TIER<n> (e.g. AGENT_ENGINEER_TIER3=claude-opus-5),
// and every feature with TIER<n>_<FEATURE> (e.g. TIER2_SPRITES=image).
// Model ids are whatever the 0G router serves.

// Models picked from what the 0G router serves (checked 2026-11-23): Claude for
// planning and code (strongest at long, correct game code), GPT-6 Astra as the
// second opinion for repairs (a different model family catches different
// mistakes), Gemini for vision review, Seedream 5.0 for sprites and scenes.
const DEFAULTS = {
  1: {
    models: {
      brief: "claude-haiku-5.5",
      designer: "kimi-k3",
      artDirector: "kimi-k3",
      illustrator: "kimi-k3",
      engineer: "gpt-6-astra",
      repair: "claude-sonnet-5.5",
      judge: "qwen3-vl-plus",
      copywriter: "claude-haiku-5.5",
      editRouter: "claude-haiku-5.5",
      image: "z-image-turbo"
    },
    features: {
      sprites: "image",       // image (0G image model + cut-out) | svg (LLM-drawn) | none (shapes)
      environment: "image",   // none | image
      cover: "image",         // none | image
      playtest: false,        // headless browser screenshots + vision judge
      repairAttempts: 2,
      fidelityPasses: 1,      // code review against the request + targeted rewrites
      maxSprites: 4,
      approval: false         // pause for style approval
    }
  },
  2: {
    models: {
      brief: "claude-sonnet-5.5",
      designer: "claude-sonnet-5.5",
      artDirector: "claude-sonnet-5.5",
      illustrator: "claude-sonnet-5.5",
      engineer: "claude-sonnet-5.5",
      repair: "gpt-6-astra",
      judge: "gemini-3.6-flash",
      copywriter: "claude-haiku-5.5",
      editRouter: "claude-sonnet-5.5",
      image: "bytedance/seedream-5.0-flash"
    },
    features: { sprites: "image", environment: "image", cover: "image", playtest: true, repairAttempts: 2, fidelityPasses: 1, maxSprites: 6, approval: false }
  },
  3: {
    models: {
      brief: "claude-opus-5.5",
      designer: "claude-opus-5.5",
      artDirector: "claude-opus-5.5",
      illustrator: "claude-opus-5.5",
      engineer: "claude-opus-5.5",
      repair: "gpt-6-astra",
      judge: "gemini-3.1-pro-preview",
      copywriter: "claude-sonnet-5.5",
      editRouter: "claude-sonnet-5.5",
      image: "bytedance/seedream-5.0-flash"
    },
    features: { sprites: "image", environment: "image", cover: "image", playtest: true, repairAttempts: 3, fidelityPasses: 2, maxSprites: 8, approval: false }
  }
};

export function normalizeTier(value) {
  const n = Number(String(value ?? "").match(/[123]/)?.[0]);
  return DEFAULTS[n] ? n : null;
}

function envValue(key) {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : null;
}

function parseFeature(raw, fallback) {
  if (raw === null) return fallback;
  if (typeof fallback === "boolean") return /^(1|true|yes|on)$/i.test(raw);
  if (typeof fallback === "number") { const n = Number(raw); return Number.isFinite(n) ? n : fallback; }
  return raw.toLowerCase();
}

export function tierConfig(tier) {
  const n = normalizeTier(tier) ?? 1;
  const base = DEFAULTS[n];
  const models = {};
  for (const [role, model] of Object.entries(base.models)) {
    const key = role.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
    models[role] = envValue(`AGENT_${key}_TIER${n}`) ?? model;
  }
  const features = {};
  for (const [name, value] of Object.entries(base.features)) {
    const key = name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
    features[name] = parseFeature(envValue(`TIER${n}_${key}`), value);
  }
  return { tier: n, models, features };
}
