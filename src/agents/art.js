import { sanitizeSvg, rasterizeSvg, inspectSprite } from "../media/svg.js";
import { cutOutSprite, normalizeBackground, normalizeCover, fallbackCover } from "../media/image.js";
import { readArtifact, readFileRef } from "../media/storage.js";
import { getStyle } from "../../styles/presets.js";
import { mergeStyle } from "./planning.js";

// Art agents.
//   gate               — optional human approval of the visual direction (key art)
//   illustrator        — one sprite (SVG via LLM, or image model + cut-out)
//   spritePlan         — fans out one illustrator node per catalog sprite
//   environmentArtist  — portrait background
//   coverArtist        — store cover
//   assetPack          — joins everything into the manifest the engine loads

// The style can change at the approval gate or in an edit; everything
// downstream reads the effective one.
export function effectiveArt(ctx) {
  const art = ctx.out("art");
  const plan = ctx.out("sprites") ?? ctx.out("edit-sprites");
  if (plan?.style) return { ...art, style: plan.style, styleId: plan.styleId };
  return art;
}

function facingRule(facing) {
  return {
    right: "The front of the object points RIGHT.",
    left: "The front of the object points LEFT.",
    up: "The front of the object points UP (top-down view, moving up the screen).",
    down: "The front of the object points DOWN (top-down view, coming toward the player).",
    none: "Symmetric, front-facing view."
  }[facing] ?? "Front-facing view.";
}

async function drawSvgSprite(ctx, { entry, style, design, feedback, previousSvg }) {
  const messages = [
    {
      role: "system",
      content: [
        "You are a senior game illustrator who hand-writes sprites as SVG.",
        "Output ONLY one complete <svg>…</svg> element: no markdown, no commentary.",
        `Root: viewBox="0 0 ${entry.width} ${entry.height}". Fill most of the canvas with the object; leave everything else transparent (no background rectangle).`,
        `Art style — ${style.name}: ${style.svgRules}`,
        `Use this palette: ${Object.entries(style.palette).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
        facingRule(entry.facing),
        "Allowed: path, rect, circle, ellipse, polygon, polyline, line, g, defs, linearGradient, radialGradient, stop, clipPath. Not allowed: text, images, scripts, filters that blur the whole sprite.",
        "Make it look like premium mobile-game art: clear silhouette at small size, readable shapes, appealing details, consistent lighting from the top-left. No ground shadow."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Game: ${design?.title ?? ""} — ${design?.pitch ?? ""}`,
        `Sprite "${entry.name}" (${entry.role ?? "prop"}): ${entry.description}`,
        feedback ? `Creator feedback to apply: ${feedback}` : null,
        previousSvg ? `Current SVG to modify (keep what is not asked to change):\n${previousSvg.slice(0, 20000)}` : null
      ].filter(Boolean).join("\n")
    }
  ];
  let last = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const reply = await ctx.llm.chat({ role: "illustrator", purpose: "illustrator", messages, maxTokens: 8000, temperature: 0.6, timeoutMs: 240_000 });
    const clean = sanitizeSvg(reply.content, { width: entry.width, height: entry.height });
    const raster = await rasterizeSvg(clean, 256);
    const check = await inspectSprite(raster.png);
    last = { clean, raster, issues: check.issues };
    if (!check.issues.length) break;
    messages.push({ role: "assistant", content: clean.svg }, { role: "user", content: `Problems with that render: ${check.issues.join(" ")} Return the corrected complete SVG.` });
  }
  if (last.issues.length && last.issues.some((i) => i.includes("empty"))) throw new Error(`Sprite render unusable: ${last.issues.join(" ")}`);
  return { png: last.raster.png, width: last.raster.width, height: last.raster.height, svg: last.clean.svg, warnings: last.issues };
}

async function drawImageSprite(ctx, { entry, style, design, feedback }) {
  const prompt = [
    style.imagePrompt,
    `${entry.description}`,
    `single ${entry.role ?? "game"} sprite for the mobile game "${design?.title ?? ""}", ${facingRule(entry.facing)}`,
    feedback ? `Changes: ${feedback}` : null,
    "centered, whole object visible, isolated on a perfectly flat solid magenta (#ff00ff) background, no shadow, no text, no border"
  ].filter(Boolean).join(". ");
  const raw = await ctx.image({ prompt, size: "1024x1024" });
  const png = await cutOutSprite(raw, { size: 256 });
  const check = await inspectSprite(png);
  if (check.issues.some((i) => i.includes("empty"))) throw new Error("Sprite cut-out left nothing");
  const { default: sharp } = await import("sharp");
  const meta = await sharp(png).metadata();
  return { png, width: meta.width, height: meta.height, svg: null, warnings: check.issues };
}

// --------------------------------------------------------------- illustrator
export const illustrator = {
  retries: 1,
  timeoutMs: 6 * 60_000,
  async run(ctx) {
    const mode = ctx.config.features.sprites;
    if (mode === "none") return { skipped: true };
    const art = effectiveArt(ctx);
    const design = ctx.out("design");
    const name = ctx.params.name;
    const entry = art.catalog.find((s) => s.name === name) ?? { name, role: "prop", description: ctx.params.feedback || name, width: 256, height: 256, facing: "none" };
    let previousSvg = null;
    const svgRef = ctx.params.edit ? ctx.run.base?.assets?.files?.[`${name}.svg`] : null;
    if (svgRef) previousSvg = (await readFileRef(svgRef).catch(() => null))?.toString("utf8") ?? null;
    const drawn = mode === "image"
      ? await drawImageSprite(ctx, { entry, style: art.style, design, feedback: ctx.params.feedback })
      : await drawSvgSprite(ctx, { entry, style: art.style, design, feedback: ctx.params.feedback, previousSvg });
    const stored = await ctx.put(`sprites/${name}.png`, drawn.png);
    const svgStored = drawn.svg ? await ctx.put(`sprites/${name}.svg`, Buffer.from(drawn.svg)) : null;
    return {
      name, role: entry.role, description: entry.description, facing: entry.facing,
      url: stored.url, path: stored.path, svgPath: svgStored?.path ?? null,
      width: drawn.width, height: drawn.height, sha256: stored.sha256, source: mode, warnings: drawn.warnings
    };
  },
  async fallback(_ctx, error) {
    return { failed: true, reason: error.message };
  }
};

// ------------------------------------------------------------------- gate
export const gate = {
  async run(ctx) {
    if (!ctx.input.approval || ctx.config.features.sprites === "none") return { approved: true, auto: true };
    const decision = await ctx.waitForApproval();
    return {
      approved: true,
      auto: Boolean(decision.auto),
      feedback: String(decision.feedback ?? "").slice(0, 800),
      style: getStyle(decision.style) ? decision.style : null
    };
  }
};

// ------------------------------------------------------------- sprite plan
export const spritePlan = {
  async run(ctx) {
    if (ctx.config.features.sprites === "none") return { skipped: true, names: [] };
    const art = ctx.out("art");
    const decision = ctx.out("approve-style") ?? {};
    const restyle = decision.style && decision.style !== art.styleId ? decision.style : null;
    const style = restyle ? mergeStyle(restyle, {}) : null;
    const redrawKey = Boolean(decision.feedback || restyle) || ctx.status("keyart") !== "done" || ctx.out("keyart")?.failed;
    return {
      feedback: decision.feedback ?? "",
      style, styleId: restyle,
      redrawKey,
      names: art.catalog.map((s) => s.name).filter((n) => n !== "player" || redrawKey)
    };
  },
  expand(output) {
    return (output.names ?? []).map((name) => ({
      id: `sprite:${name}`, agent: "illustrator", label: `Draw ${name}`,
      params: { name, feedback: output.feedback }, deps: ["sprites"], group: "sprite"
    }));
  }
};

export const spriteEditPlan = {
  async run(ctx) {
    const plan = ctx.out("edit-plan");
    const style = plan.style ? mergeStyle(plan.style, {}) : null;
    const catalogNames = (ctx.run.base.art?.catalog ?? []).map((s) => s.name);
    // A restyle redraws every sprite; otherwise only the requested ones.
    const targets = style
      ? catalogNames.map((name) => ({ name, instructions: plan.sprites.find((s) => s.name === name)?.instructions ?? "" }))
      : plan.sprites;
    if (ctx.config.features.sprites === "none" && !targets.length) return { skipped: true, targets: [] };
    return { style, styleId: plan.style, targets };
  },
  expand(output) {
    return (output.targets ?? []).map((t) => ({
      id: `sprite:${t.name}`, agent: "illustrator", label: `Redraw ${t.name}`,
      params: { name: t.name, feedback: t.instructions, edit: true }, deps: ["edit-sprites"], group: "sprite"
    }));
  }
};

// ------------------------------------------------------------ environment
export const environmentArtist = {
  retries: 1,
  timeoutMs: 4 * 60_000,
  async run(ctx) {
    if (ctx.config.features.environment !== "image") return { skipped: true };
    const art = effectiveArt(ctx);
    const design = ctx.out("design");
    const decision = ctx.out("approve-style") ?? {};
    const prompt = [
      art.style.imagePrompt,
      `vertical mobile game background for "${design.title}": ${art.environmentPrompt || design.background?.description || design.pitch}`,
      decision.feedback ? `Creator feedback: ${decision.feedback}` : null,
      "no characters, no creatures, no text, no UI, readable calm center area for gameplay, soft depth, colors harmonious with " + Object.values(art.style.palette).slice(0, 4).join(" ")
    ].filter(Boolean).join(". ");
    const raw = await ctx.image({ prompt, size: "1024x1536" });
    const jpg = await normalizeBackground(raw);
    const stored = await ctx.put("sprites/environment.jpg", jpg);
    return { name: "environment", role: "background", url: stored.url, path: stored.path, width: 720, height: 1280, sha256: stored.sha256 };
  },
  async fallback(_ctx, error) {
    return { failed: true, reason: error.message };
  }
};

// ------------------------------------------------------------------ cover
async function keyArtPng(ctx) {
  const key = ctx.out("keyart");
  const redrawn = ctx.group("sprite").find((s) => s.output?.name === "player" && !s.output.failed)?.output;
  const source = redrawn ?? (key && !key.failed && !key.skipped ? key : null);
  if (!source?.path) return null;
  return readArtifact(ctx.runId, source.path).catch(() => null);
}

async function deterministicCover(ctx) {
  const art = effectiveArt(ctx);
  const design = ctx.out("design");
  const webp = await fallbackCover({ title: design.title, palette: art.style.palette, playerPng: await keyArtPng(ctx) });
  const stored = await ctx.put("cover.webp", webp);
  return { url: stored.url, path: stored.path, sha256: stored.sha256, source: "fallback" };
}

export const coverArtist = {
  retries: 0,
  timeoutMs: 4 * 60_000,
  async run(ctx) {
    if (ctx.config.features.cover !== "image") return deterministicCover(ctx);
    const art = effectiveArt(ctx);
    const design = ctx.out("design");
    const title = String(design.title).toUpperCase();
    const prompt = [
      art.style.imagePrompt,
      `mobile game cover art for "${design.title}": ${art.coverPrompt || design.pitch}`,
      ctx.out("keyart")?.description ? `hero character: ${ctx.out("keyart").description}` : null,
      `bold title text "${title}" across the top in a chunky game-logo font, spelled exactly`,
      "vertical 2:3 composition, dynamic action, vibrant, crisp, important elements inside safe margins"
    ].filter(Boolean).join(". ");
    const raw = await ctx.image({ prompt, size: "1024x1536" });
    const webp = await normalizeCover(raw);
    const stored = await ctx.put("cover.webp", webp);
    return { url: stored.url, path: stored.path, sha256: stored.sha256, source: "image" };
  },
  fallback: (ctx) => deterministicCover(ctx)
};

// ------------------------------------------------------------- asset pack
export const assetPack = {
  async run(ctx) {
    const art = effectiveArt(ctx);
    const base = ctx.run.base?.assets ?? { manifest: {}, catalog: [], files: {} };
    const manifest = { ...base.manifest };
    const files = { ...base.files };
    const catalogByName = new Map((base.catalog ?? []).map((c) => [c.name, c]));
    const add = (out) => {
      if (!out || out.failed || out.skipped || !out.url) return;
      manifest[out.name] = out.url;
      // "runId/path" so edit runs can reach files their parent runs created.
      files[out.name] = `${ctx.runId}/${out.path}`;
      if (out.svgPath) files[`${out.name}.svg`] = `${ctx.runId}/${out.svgPath}`;
      const entry = art.catalog.find((c) => c.name === out.name) ?? {};
      catalogByName.set(out.name, {
        name: out.name, kind: out.role ?? entry.role ?? "prop", description: out.description ?? entry.description ?? "",
        facing: out.facing ?? entry.facing ?? "none", width: out.width, height: out.height,
        aspect: Number((out.width / out.height).toFixed(3))
      });
    };
    const key = ctx.out("keyart");
    if (ctx.run.kind === "build") add(key);
    for (const s of ctx.group("sprite")) add(s.output); // redrawn sprites override key art
    add(ctx.out("environment"));
    return {
      manifest,
      catalog: [...catalogByName.values()],
      files,
      count: Object.keys(manifest).length,
      missing: art.catalog.filter((c) => !manifest[c.name]).map((c) => c.name)
    };
  }
};
