// Per-tier agent roster. Every model role can be overridden from the
// environment with AGENT_<ROLE>_TIER<n> (e.g. AGENT_ENGINEER_TIER3=claude-opus-5),
// and every feature with TIER<n>_<FEATURE> (e.g. TIER2_SPRITES=image).
// Model ids are whatever the 0G router serves.

const DEFAULTS = {
  1: {
    models: {
      brief: "deepseek-v4-flash",
      designer: "glm-5",
      artDirector: "glm-5",
      illustrator: "glm-5",
      engineer: "gpt-5.6-terra",
      repair: "gpt-5.6-sol",
      judge: "qwen/qwen3-vl-30b-a3b-instruct",
      copywriter: "deepseek-v4-flash",
      editRouter: "deepseek-v4-flash",
      image: "z-image-turbo"
    },
    features: {
      sprites: "none",        // none | svg | image
      environment: "none",    // none | image
      cover: "image",         // none | image
      playtest: false,        // headless browser screenshots + vision judge
      repairAttempts: 1,
      maxSprites: 0,
      approval: false         // pause for style approval
    }
  },
  2: {
    models: {
      brief: "deepseek-v4-flash",
      designer: "gpt-5.6-terra",
      artDirector: "gpt-5.6-terra",
      illustrator: "claude-opus-4-8",
      engineer: "claude-opus-4-8",
      repair: "gpt-5.6-sol",
      judge: "qwen3.7-plus",
      copywriter: "deepseek-v4-flash",
      editRouter: "deepseek-v4-flash",
      image: "z-image-turbo"
    },
    features: { sprites: "svg", environment: "image", cover: "image", playtest: true, repairAttempts: 2, maxSprites: 5, approval: false }
  },
  3: {
    models: {
      brief: "MiniMax-M3",
      designer: "claude-opus-4-8",
      artDirector: "claude-opus-5",
      illustrator: "claude-opus-5",
      engineer: "claude-opus-5",
      repair: "gpt-5.6-terra",
      judge: "kimi-k3",
      copywriter: "deepseek-v4-flash",
      editRouter: "deepseek-v4-flash",
      image: "z-image-turbo"
    },
    features: { sprites: "svg", environment: "image", cover: "image", playtest: true, repairAttempts: 3, maxSprites: 7, approval: false }
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
