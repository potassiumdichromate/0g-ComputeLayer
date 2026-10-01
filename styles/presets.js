// Art-style presets. Picking a style up front (like Higgsfield's style picker)
// is the single biggest consistency win: every agent — art director,
// illustrators, cover artist and the engine's procedural shapes — works from
// the same palette, outline and rendering rules instead of each inventing one.

export const STYLE_PRESETS = {
  cartoon: {
    name: "Bright Cartoon",
    description: "Chunky, friendly mobile-game cartoon with bold outlines and soft two-tone shading.",
    palette: { bg1: "#2b1b6b", bg2: "#5a3fc0", primary: "#ffcf3f", secondary: "#38d6ff", accent: "#ff4f9a", danger: "#ff5a4f", good: "#5dff8f", text: "#ffffff" },
    outline: "#1b1733", outlineWidth: 3, radius: 10, deco: "clouds",
    font: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
    fonts: { display: "Lilita One", displayWeight: "400", ui: "Nunito", uiWeight: "800", google: "family=Lilita+One&family=Nunito:wght@700;800;900" },
    svgRules: "Thick rounded dark outlines (about 5% of the sprite size) in #1b1733, flat base colors with one soft darker shade on the lower-right and one small white highlight on the upper-left. Big friendly proportions, large eyes on characters, simple readable silhouettes.",
    imagePrompt: "vibrant cartoon mobile game art, bold dark outlines, soft cel shading, saturated colors, friendly chunky shapes"
  },
  pixel: {
    name: "Retro Pixel",
    description: "16-bit arcade pixel art with a limited palette and hard edges.",
    palette: { bg1: "#0f0e2a", bg2: "#262b5e", primary: "#ffd23f", secondary: "#3ec1ff", accent: "#ff5e8a", danger: "#ff4040", good: "#6cff6c", text: "#f6f6f6" },
    outline: "#0a0a14", outlineWidth: 2, radius: 0, deco: "stars",
    font: '"Courier New", ui-monospace, monospace',
    fonts: { display: "Press Start 2P", displayWeight: "400", ui: "Silkscreen", uiWeight: "700", google: "family=Press+Start+2P&family=Silkscreen:wght@400;700" },
    svgRules: "Pixel art: build the sprite ONLY from axis-aligned <rect> squares on a 16x16 or 24x24 grid scaled up to the viewBox, add shape-rendering=\"crispEdges\" on the root, at most 6 colors, a 1-cell dark outline, no curves, no gradients.",
    imagePrompt: "16-bit pixel art game sprite style, limited palette, crisp pixels, retro arcade"
  },
  neon: {
    name: "Neon Synthwave",
    description: "Glowing neon lines on deep purple-black, synthwave arcade energy.",
    palette: { bg1: "#07021a", bg2: "#2a0845", primary: "#fdf500", secondary: "#00f0ff", accent: "#ff2fd6", danger: "#ff3860", good: "#39ff88", text: "#ffffff" },
    outline: "#ffffff", outlineWidth: 2, radius: 6, deco: "grid",
    font: '"Segoe UI", system-ui, sans-serif',
    fonts: { display: "Orbitron", displayWeight: "900", ui: "Rajdhani", uiWeight: "700", google: "family=Orbitron:wght@700;900&family=Rajdhani:wght@600;700" },
    svgRules: "Neon style: dark fills (#140a2e) with bright glowing strokes in cyan, magenta and yellow, stroke-width about 4% of the size, add a soft glow using a duplicated wider stroke at low opacity underneath. Geometric, sleek shapes.",
    imagePrompt: "neon synthwave game art, glowing cyan and magenta outlines, dark purple background, retro-futuristic"
  },
  flat: {
    name: "Flat Minimal",
    description: "Clean flat vector shapes, no outlines, calm modern palette.",
    palette: { bg1: "#1f3b4d", bg2: "#2f6070", primary: "#f7c948", secondary: "#7ad3e0", accent: "#f78c6b", danger: "#ef476f", good: "#83e377", text: "#ffffff" },
    outline: "#1f3b4d", outlineWidth: 0, radius: 12, deco: "dots",
    font: '"Segoe UI", "Helvetica Neue", system-ui, sans-serif',
    fonts: { display: "Poppins", displayWeight: "800", ui: "Poppins", uiWeight: "700", google: "family=Poppins:wght@600;700;800" },
    svgRules: "Flat minimal vector: no outlines, geometric primitives, 3-4 flat colors per sprite, one subtle flat shadow shape for depth, generous rounded corners.",
    imagePrompt: "flat minimal vector game illustration, clean geometric shapes, no outlines, modern pastel palette"
  },
  fantasy: {
    name: "Storybook Fantasy",
    description: "Warm painterly storybook fantasy with rich greens and golds.",
    palette: { bg1: "#16322a", bg2: "#2e5e3f", primary: "#f2c14e", secondary: "#8fd3c7", accent: "#e36f4b", danger: "#d7263d", good: "#a3e635", text: "#fff8e7" },
    outline: "#2a1d12", outlineWidth: 3, radius: 9, deco: "hills",
    font: 'Georgia, "Palatino Linotype", serif',
    fonts: { display: "Cinzel", displayWeight: "900", ui: "Nunito", uiWeight: "800", google: "family=Cinzel:wght@700;900&family=Nunito:wght@700;800" },
    svgRules: "Storybook fantasy: warm brown outlines (#2a1d12), rich layered fills with two shade steps, small gold accents, organic hand-drawn feeling curves.",
    imagePrompt: "storybook fantasy game art, painterly, warm lighting, rich greens and golds, whimsical"
  },
  kawaii: {
    name: "Cute Kawaii",
    description: "Soft pastel kawaii characters, round shapes, blush cheeks.",
    palette: { bg1: "#ffb3c7", bg2: "#b8a4ff", primary: "#ffe066", secondary: "#7ee0ff", accent: "#ff6fa5", danger: "#ff5c7a", good: "#7dffb0", text: "#4a2b4f" },
    outline: "#4a2b4f", outlineWidth: 3, radius: 14, deco: "bubbles",
    font: '"Trebuchet MS", "Comic Sans MS", system-ui, sans-serif',
    fonts: { display: "Fredoka", displayWeight: "700", ui: "Fredoka", uiWeight: "600", google: "family=Fredoka:wght@500;600;700" },
    svgRules: "Kawaii: very round soft shapes, pastel fills, dark plum outlines (#4a2b4f), tiny dot eyes, pink blush ovals on cheeks, small sparkles.",
    imagePrompt: "cute kawaii game art, pastel colors, round soft shapes, blush cheeks, adorable"
  },
  scifi: {
    name: "Sleek Sci-Fi",
    description: "Hard-surface sci-fi with metallic panels and cyan energy accents.",
    palette: { bg1: "#050b18", bg2: "#10284a", primary: "#ffb300", secondary: "#29e0ff", accent: "#7c4dff", danger: "#ff3d57", good: "#3dffb5", text: "#e8f4ff" },
    outline: "#030712", outlineWidth: 2, radius: 4, deco: "stars",
    font: '"Segoe UI", "Roboto", system-ui, sans-serif',
    fonts: { display: "Audiowide", displayWeight: "400", ui: "Exo 2", uiWeight: "700", google: "family=Audiowide&family=Exo+2:wght@600;700" },
    svgRules: "Hard-surface sci-fi: angular panels in cool greys and navy, thin dark outlines, glowing cyan energy lines and small orange warning details, metallic two-step shading.",
    imagePrompt: "sleek sci-fi game art, hard-surface metallic panels, glowing cyan energy, cinematic space lighting"
  }
};

const STYLE_KEYWORDS = {
  pixel: ["pixel", "8-bit", "8bit", "16-bit", "retro", "arcade", "nes", "snes"],
  neon: ["neon", "synthwave", "cyber", "cyberpunk", "glow", "tron", "vaporwave"],
  fantasy: ["fantasy", "dragon", "wizard", "magic", "knight", "castle", "forest", "elf", "medieval", "fairy"],
  kawaii: ["cute", "kawaii", "cat", "bunny", "puppy", "candy", "pastel", "adorable", "kitten"],
  scifi: ["space", "alien", "robot", "sci-fi", "scifi", "galaxy", "spaceship", "mech", "planet", "rocket"],
  flat: ["minimal", "minimalist", "flat", "clean", "simple", "zen"]
};

export function listStyles() {
  return Object.entries(STYLE_PRESETS).map(([id, s]) => ({ id, name: s.name, description: s.description, palette: s.palette }));
}

export function getStyle(id) {
  return STYLE_PRESETS[id] ? { id, ...STYLE_PRESETS[id] } : null;
}

export function inferStyle(prompt) {
  const text = String(prompt || "").toLowerCase();
  let best = "cartoon";
  let bestScore = 0;
  for (const [id, words] of Object.entries(STYLE_KEYWORDS)) {
    const score = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best;
}

// The subset of a style the engine understands (goes on gamePackage.style).
export function engineStyle(style) {
  return {
    palette: style.palette,
    outline: style.outline,
    outlineWidth: style.outlineWidth,
    radius: style.radius,
    font: style.font,
    fonts: style.fonts,
    deco: style.deco
  };
}
