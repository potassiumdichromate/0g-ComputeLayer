import sharp from "sharp";
import { matchRecipe, recipeCode } from "../../recipes/index.js";
import { inferStyle } from "../../styles/presets.js";

// Offline stand-in for the 0G router (LLM_MOCK=1 or no ZERO_G_API_KEY).
// Returns well-formed, deterministic replies per agent so the full DAG —
// scheduling, fan-out, QA, browser playtest, packaging — runs without credits.

const flatten = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => p?.text ?? "").join("\n") : "");

function between(text, start, end) {
  const i = text.indexOf(start);
  if (i < 0) return null;
  const from = i + start.length;
  const j = end ? text.indexOf(end, from) : -1;
  return text.slice(from, j < 0 ? undefined : j);
}

function jsonAfter(text, label) {
  const chunk = between(text, label, null);
  if (!chunk) return null;
  const start = chunk.indexOf("{");
  let depth = 0;
  for (let i = start; i < chunk.length; i += 1) {
    if (chunk[i] === "{") depth += 1;
    else if (chunk[i] === "}") { depth -= 1; if (depth === 0) { try { return JSON.parse(chunk.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

function hue(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export async function mockChat({ purpose, messages }) {
  const { defaultDesign } = await import("../agents/planning.js");
  const all = messages.map((m) => flatten(m.content)).join("\n");
  const last = flatten(messages[messages.length - 1]?.content);
  const prompt = (between(all, "PROMPT:\n", "\n\n") ?? "").trim();
  const recipe = all.match(/\[\[recipe:([a-z0-9_-]+)\]\]/)?.[1] ?? matchRecipe(prompt).id;

  switch (purpose) {
    case "brief": {
      const words = prompt.replace(/[^a-zA-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 3).slice(0, 2);
      return JSON.stringify({
        title: words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") + " Rush" : "Mock Game",
        pitch: prompt.slice(0, 160), genre: "arcade", recipe: matchRecipe(prompt).id, style: inferStyle(prompt), orientation: "portrait"
      });
    }
    case "designer": {
      const b = jsonAfter(all, "BRIEF:") ?? { title: "Mock Game" };
      return JSON.stringify(defaultDesign({ ...b, recipe, orientation: "portrait" }, prompt));
    }
    case "artDirector": {
      const design = jsonAfter(all, "GAME DESIGN:") ?? { entities: [] };
      return JSON.stringify({
        styleName: "mock", notes: "",
        sprites: design.entities.filter((e) => e.needsSprite).map((e) => ({ name: e.name, description: e.description, width: 256, height: 256, facing: e.role === "player" ? "right" : "none" })),
        environmentPrompt: "mock background", coverPrompt: "mock cover"
      });
    }
    case "illustrator": {
      const name = last.match(/Sprite "([^"]+)"/)?.[1] ?? "thing";
      const h = hue(name);
      return `<svg viewBox="0 0 256 256"><circle cx="128" cy="136" r="104" fill="hsl(${h},80%,60%)" stroke="#1b1733" stroke-width="12"/><ellipse cx="96" cy="112" rx="18" ry="24" fill="#fff"/><ellipse cx="160" cy="112" rx="18" ry="24" fill="#fff"/><circle cx="102" cy="116" r="9" fill="#1b1733"/><circle cx="166" cy="116" r="9" fill="#1b1733"/><path d="M92 168 Q128 196 164 168" stroke="#1b1733" stroke-width="10" fill="none" stroke-linecap="round"/></svg>`;
    }
    case "engineer":
      return recipeCode(recipe);
    case "engineerEdit":
      return between(all, "CURRENT GAME CODE:\n```js\n", "\n```") ?? recipeCode(recipe);
    case "repair":
      return between(all, "CODE:\n```js\n", "\n```") ?? recipeCode(recipe);
    case "judge":
      return JSON.stringify({ pass: true, scores: { visuals: 7, readability: 8, fidelity: 7 }, issues: [] });
    case "copywriter":
      return JSON.stringify({ description: "A mock game generated offline. Tap to play.", howToPlay: "Tap to play.", tags: [recipe, "mock"], category: "Arcade" });
    case "editRouter": {
      const request = between(all, "REQUEST: ", "\n") ?? "";
      const art = /\b(look|color|colour|art|sprite|draw|skin|cat|dog)\b/i.test(request);
      return JSON.stringify({ summary: request, code: !art, codeInstructions: request, sprites: art ? [{ name: "player", instructions: request }] : [], style: null });
    }
    default:
      return "{}";
  }
}

export async function mockImage({ prompt, size }) {
  const [w, h] = String(size || "1024x1024").split("x").map(Number);
  const hh = hue(prompt);
  // Sprite requests ask for a chroma-key background: draw a character on it so
  // the real cut-out path runs offline.
  const key = /pure (magenta|green)/.exec(prompt)?.[1];
  if (key) {
    const bg = key === "green" ? "#00ff00" : "#ff00ff";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/><ellipse cx="${w / 2}" cy="${h * 0.86}" rx="${w * 0.25}" ry="${h * 0.04}" fill="${key === "green" ? "#00aa00" : "#aa00aa"}"/><circle cx="${w / 2}" cy="${h / 2}" r="${w * 0.3}" fill="hsl(${hh},75%,58%)" stroke="#1b1733" stroke-width="${w * 0.025}"/><circle cx="${w * 0.42}" cy="${h * 0.45}" r="${w * 0.05}" fill="#fff"/><circle cx="${w * 0.58}" cy="${h * 0.45}" r="${w * 0.05}" fill="#fff"/><circle cx="${w * 0.43}" cy="${h * 0.46}" r="${w * 0.022}" fill="#1b1733"/><circle cx="${w * 0.59}" cy="${h * 0.46}" r="${w * 0.022}" fill="#1b1733"/></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hh},60%,35%)"/><stop offset="1" stop-color="hsl(${(hh + 60) % 360},60%,20%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w / 2}" cy="${h * 0.6}" r="${w * 0.22}" fill="hsl(${(hh + 180) % 360},70%,60%)" opacity="0.5"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
